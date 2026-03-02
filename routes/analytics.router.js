const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

// ---- thresholds (simple version) ----
const TH = {
  HIGH_TEMP: 35,      // °C
  LOW_HUM: 40,        // %
  LOW_SOIL: 30,       // %
  STALE_MIN: 15       // minutes (no readings)
};

// avoid duplicate spam: don't insert same alert_type for same device within X minutes
async function recentlyCreated(alert_type, device_id, minutes = 30) {
  const [rows] = await pool.query(
    `
    SELECT id
    FROM alerts
    WHERE resolved=0
      AND alert_type=?
      AND ( (device_id IS NULL AND ? IS NULL) OR device_id=? )
      AND created_at >= NOW() - INTERVAL ? MINUTE
    LIMIT 1
    `,
    [alert_type, device_id ?? null, device_id ?? null, minutes]
  );
  return rows.length > 0;
}

async function createAlert({ alert_type, severity, message, device_id = null, greenhouse_id = null, section_id = null }) {
  // don't spam duplicates
  const dup = await recentlyCreated(alert_type, device_id, 30);
  if (dup) return;

  await pool.query(
    `INSERT INTO alerts (alert_type, severity, message, device_id, greenhouse_id, section_id)
     VALUES (?,?,?,?,?,?)`,
    [alert_type, severity, message, device_id, greenhouse_id, section_id]
  );
}

/**
 * GET /api/analytics/summary
 * Averages for last 24 hours (filtered for user if not admin)
 */
router.get("/summary", requireAuth, async (req, res) => {
  try {
    const role = (req.user?.role || "").toLowerCase();
    const userId = req.user?.userId;

    const deviceWhere = role === "admin" ? "" : "AND d.assigned_user_id = ?";
    const params = role === "admin" ? [] : [userId];

    const [[avg]] = await pool.query(
      `
      SELECT 
        ROUND(AVG(sr.temperature), 2) AS avgTemp,
        ROUND(AVG(sr.humidity), 2) AS avgHum,
        ROUND(AVG(sr.soil_moisture), 2) AS avgSoil,
        COUNT(*) AS readingsCount
      FROM sensor_readings sr
      INNER JOIN devices d ON d.id = sr.device_id
      WHERE sr.created_at >= NOW() - INTERVAL 24 HOUR
      ${deviceWhere}
      `,
      params
    );

    const [[latest]] = await pool.query(
      `
      SELECT MAX(sr.created_at) AS lastReadingAt
      FROM sensor_readings sr
      INNER JOIN devices d ON d.id = sr.device_id
      WHERE 1=1
      ${role === "admin" ? "" : "AND d.assigned_user_id = ?"}
      `,
      params
    );

    res.json({
      avgTemp: avg?.avgTemp ?? null,
      avgHum: avg?.avgHum ?? null,
      avgSoil: avg?.avgSoil ?? null,
      readingsCount: avg?.readingsCount ?? 0,
      lastReadingAt: latest?.lastReadingAt ?? null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Analytics error" });
  }
});

/**
 * POST /api/analytics/run
 * Generate alerts based on LAST reading per device (simple + accurate)
 */
router.post("/run", requireAuth, async (req, res) => {
  try {
    const role = (req.user?.role || "").toLowerCase();
    const userId = req.user?.userId;

    const whereClause = role === "admin" ? "" : "WHERE d.assigned_user_id = ?";
    const params = role === "admin" ? [] : [userId];

    // last reading per device
    const [rows] = await pool.query(
      `
      SELECT 
        d.id AS device_id,
        d.device_name,
        d.greenhouse_id,
        d.section_id,
        r.temperature,
        r.humidity,
        r.soil_moisture,
        r.created_at
      FROM devices d
      LEFT JOIN (
        SELECT sr.*
        FROM sensor_readings sr
        INNER JOIN (
          SELECT device_id, MAX(id) AS max_id
          FROM sensor_readings
          GROUP BY device_id
        ) last ON last.max_id = sr.id
      ) r ON r.device_id = d.id
      ${whereClause}
      ORDER BY d.id DESC
      `,
      params
    );

    let created = 0;

    for (const it of rows) {
      const t = it.temperature;
      const h = it.humidity;
      const s = it.soil_moisture;

      // stale/no data
      if (!it.created_at) {
        await createAlert({
          alert_type: "NO_DATA",
          severity: "HIGH",
          message: `No sensor readings received for device "${it.device_name}".`,
          device_id: it.device_id,
          greenhouse_id: it.greenhouse_id,
          section_id: it.section_id
        });
        created++;
        continue;
      } else {
        const last = new Date(it.created_at).getTime();
        const now = Date.now();
        const diffMin = (now - last) / 60000;

        if (diffMin > TH.STALE_MIN) {
          await createAlert({
            alert_type: "STALE_DATA",
            severity: "MEDIUM",
            message: `Last reading is ${Math.floor(diffMin)} min old for "${it.device_name}".`,
            device_id: it.device_id,
            greenhouse_id: it.greenhouse_id,
            section_id: it.section_id
          });
          created++;
        }
      }

      if (typeof t === "number" && t > TH.HIGH_TEMP) {
        await createAlert({
          alert_type: "HIGH_TEMP",
          severity: "HIGH",
          message: `High temperature ${t}°C detected on "${it.device_name}".`,
          device_id: it.device_id,
          greenhouse_id: it.greenhouse_id,
          section_id: it.section_id
        });
        created++;
      }

      if (typeof h === "number" && h < TH.LOW_HUM) {
        await createAlert({
          alert_type: "LOW_HUMIDITY",
          severity: "MEDIUM",
          message: `Low humidity ${h}% detected on "${it.device_name}".`,
          device_id: it.device_id,
          greenhouse_id: it.greenhouse_id,
          section_id: it.section_id
        });
        created++;
      }

      if (typeof s === "number" && s < TH.LOW_SOIL) {
        await createAlert({
          alert_type: "LOW_SOIL",
          severity: "HIGH",
          message: `Low soil moisture ${s}% detected on "${it.device_name}".`,
          device_id: it.device_id,
          greenhouse_id: it.greenhouse_id,
          section_id: it.section_id
        });
        created++;
      }
    }

    res.json({ message: "Alerts generated", scannedDevices: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Run analytics failed" });
  }
});

/**
 * GET /api/analytics/alerts
 * Active alerts (admin sees all, user sees only their devices)
 */
router.get("/alerts", requireAuth, async (req, res) => {
  try {
    const role = (req.user?.role || "").toLowerCase();
    const userId = req.user?.userId;

    const where = role === "admin"
      ? ""
      : `AND (a.device_id IN (SELECT id FROM devices WHERE assigned_user_id=?))`;

    const params = role === "admin" ? [] : [userId];

    const [rows] = await pool.query(
      `
      SELECT a.*
      FROM alerts a
      WHERE a.resolved=0
      ${where}
      ORDER BY a.id DESC
      LIMIT 30
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error loading alerts" });
  }
});

module.exports = router;