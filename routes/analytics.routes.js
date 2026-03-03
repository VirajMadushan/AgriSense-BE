const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

// ---- thresholds (simple version) ----
const TH = {
  HIGH_TEMP: 35, // °C
  LOW_HUM: 40,   // %
  LOW_SOIL: 30,  // %
  STALE_MIN: 15  // minutes (no readings)
};

// ===========================
// HELPERS
// ===========================
async function recentlyCreated(alert_type, device_id, minutes = 30) {
  const [rows] = await pool.query(
    `
    SELECT id
    FROM alerts
    WHERE resolved = 0
      AND alert_type = ?
      AND (
        (device_id IS NULL AND ? IS NULL)
        OR device_id = ?
      )
      AND created_at >= NOW() - INTERVAL ? MINUTE
    LIMIT 1
    `,
    [alert_type, device_id ?? null, device_id ?? null, minutes]
  );
  return rows.length > 0;
}

async function createAlert({
  alert_type,
  severity,
  message,
  device_id = null,
  greenhouse_id = null,
  section_id = null
}) {
  // avoid duplicate spam (same alert for same device in last 30 minutes)
  const dup = await recentlyCreated(alert_type, device_id, 30);
  if (dup) return false;

  await pool.query(
    `INSERT INTO alerts (alert_type, severity, message, device_id, greenhouse_id, section_id)
     VALUES (?,?,?,?,?,?)`,
    [alert_type, severity, message, device_id, greenhouse_id, section_id]
  );

  return true;
}

/**
 * ===========================
 * GET /api/analytics/summary
 * Averages for last 24 hours
 * - Admin: all devices
 * - User: only assigned devices
 * ===========================
 */
router.get("/summary", requireAuth, async (req, res) => {
  try {
    const role = (req.user?.role || "").toLowerCase();
    const userId = req.user?.userId;

    // ✅ safe filter: admin sees all, user sees only assigned
    const whereRole = role === "admin" ? "1=1" : "d.assigned_user_id = ?";

    const params = role === "admin" ? [] : [userId];

    const [[avg]] = await pool.query(
      `
      SELECT 
        ROUND(AVG(sr.temperature), 2) AS avgTemp,
        ROUND(AVG(sr.humidity), 2) AS avgHum,
        ROUND(AVG(sr.soil_moisture), 2) AS avgSoil,
        COUNT(*) AS readingsCount
      FROM sensor_readings sr
      LEFT JOIN devices d ON d.id = sr.device_id
      WHERE sr.created_at >= NOW() - INTERVAL 24 HOUR
        AND ${whereRole}
      `,
      params
    );

    const [[latest]] = await pool.query(
      `
      SELECT MAX(sr.created_at) AS lastReadingAt
      FROM sensor_readings sr
      LEFT JOIN devices d ON d.id = sr.device_id
      WHERE ${whereRole}
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
 * ===========================
 * POST /api/analytics/run
 * Generate alerts based on LAST reading per device
 * - Admin: scans all devices
 * - User: scans only assigned devices
 * ===========================
 */
router.post("/run", requireAuth, async (req, res) => {
  try {
    const role = (req.user?.role || "").toLowerCase();
    const userId = req.user?.userId;

    const whereClause = role === "admin" ? "" : "WHERE d.assigned_user_id = ?";
    const params = role === "admin" ? [] : [userId];

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

    let createdCount = 0;

    for (const it of rows) {
      const t = it.temperature;
      const h = it.humidity;
      const s = it.soil_moisture;

      // NO DATA
      if (!it.created_at) {
        const didCreate = await createAlert({
          alert_type: "NO_DATA",
          severity: "HIGH",
          message: `No sensor readings received for device "${it.device_name}".`,
          device_id: it.device_id,
          greenhouse_id: it.greenhouse_id,
          section_id: it.section_id
        });
        if (didCreate) createdCount++;
        continue;
      }

      // STALE DATA
      const last = new Date(it.created_at).getTime();
      const now = Date.now();
      const diffMin = (now - last) / 60000;

      if (diffMin > TH.STALE_MIN) {
        const didCreate = await createAlert({
          alert_type: "STALE_DATA",
          severity: "MEDIUM",
          message: `Last reading is ${Math.floor(diffMin)} min old for "${it.device_name}".`,
          device_id: it.device_id,
          greenhouse_id: it.greenhouse_id,
          section_id: it.section_id
        });
        if (didCreate) createdCount++;
      }

      // HIGH TEMP
      if (typeof t === "number" && t > TH.HIGH_TEMP) {
        const didCreate = await createAlert({
          alert_type: "HIGH_TEMP",
          severity: "HIGH",
          message: `High temperature ${t}°C detected on "${it.device_name}".`,
          device_id: it.device_id,
          greenhouse_id: it.greenhouse_id,
          section_id: it.section_id
        });
        if (didCreate) createdCount++;
      }

      // LOW HUMIDITY
      if (typeof h === "number" && h < TH.LOW_HUM) {
        const didCreate = await createAlert({
          alert_type: "LOW_HUMIDITY",
          severity: "MEDIUM",
          message: `Low humidity ${h}% detected on "${it.device_name}".`,
          device_id: it.device_id,
          greenhouse_id: it.greenhouse_id,
          section_id: it.section_id
        });
        if (didCreate) createdCount++;
      }

      // LOW SOIL
      if (typeof s === "number" && s < TH.LOW_SOIL) {
        const didCreate = await createAlert({
          alert_type: "LOW_SOIL",
          severity: "HIGH",
          message: `Low soil moisture ${s}% detected on "${it.device_name}".`,
          device_id: it.device_id,
          greenhouse_id: it.greenhouse_id,
          section_id: it.section_id
        });
        if (didCreate) createdCount++;
      }
    }

    res.json({
      message: "Alerts generated",
      scannedDevices: rows.length,
      createdAlerts: createdCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Run analytics failed" });
  }
});

/**
 * ===========================
 * GET /api/analytics/alerts
 * Active alerts (resolved=0)
 * - Admin: all alerts
 * - User: alerts only for their assigned devices
 * ===========================
 */
router.get("/alerts", requireAuth, async (req, res) => {
  try {
    const role = (req.user?.role || "").toLowerCase();
    const userId = req.user?.userId;

    const where =
      role === "admin"
        ? ""
        : `AND a.device_id IN (SELECT id FROM devices WHERE assigned_user_id=?)`;

    const params = role === "admin" ? [] : [userId];

    const [rows] = await pool.query(
      `
      SELECT a.*
      FROM alerts a
      WHERE a.resolved = 0
      ${where}
      ORDER BY a.id DESC
      LIMIT 50
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error loading alerts" });
  }
});

/**
 * ===========================
 * PATCH /api/analytics/alerts/:id/resolve
 * Resolve an alert
 * ===========================
 */
router.patch("/alerts/:id/resolve", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid alert id" });

    await pool.query(
      `UPDATE alerts SET resolved=1 WHERE id=?`,
      [id]
    );

    res.json({ message: "Alert resolved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Resolve failed" });
  }
});

module.exports = router;