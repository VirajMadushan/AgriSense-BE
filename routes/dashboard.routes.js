const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();

/**
 * ADMIN DASHBOARD
 * GET /api/dashboard/admin
 */
router.get("/admin", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const [[usersTotal]] = await pool.query("SELECT COUNT(*) AS total FROM users");
    const [[adminsTotal]] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE role='admin'");
    const [[normalUsersTotal]] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE role='user'");

    const [[devicesTotal]] = await pool.query("SELECT COUNT(*) AS total FROM devices");
    const [[devicesOn]] = await pool.query("SELECT COUNT(*) AS total FROM devices WHERE status='ON'");
    const [[devicesOff]] = await pool.query("SELECT COUNT(*) AS total FROM devices WHERE status='OFF'");
    const [[devicesAssigned]] = await pool.query("SELECT COUNT(*) AS total FROM devices WHERE assigned_user_id IS NOT NULL");
    const [[devicesUnassigned]] = await pool.query("SELECT COUNT(*) AS total FROM devices WHERE assigned_user_id IS NULL");

    res.json({
      users: {
        total: usersTotal.total,
        admins: adminsTotal.total,
        normalUsers: normalUsersTotal.total
      },
      devices: {
        total: devicesTotal.total,
        on: devicesOn.total,
        off: devicesOff.total,
        assigned: devicesAssigned.total,
        unassigned: devicesUnassigned.total
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * USER DASHBOARD
 * GET /api/dashboard/user
 */
// USER DASHBOARD STATS
router.get("/user", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [[me]] = await pool.query(
      "SELECT id, full_name, email, role, created_at FROM users WHERE id=?",
      [userId]
    );

    const [[total]] = await pool.query(
      "SELECT COUNT(*) AS total FROM devices WHERE assigned_user_id=?",
      [userId]
    );

    const [[on]] = await pool.query(
      "SELECT COUNT(*) AS total FROM devices WHERE assigned_user_id=? AND status='ON'",
      [userId]
    );

    const [[off]] = await pool.query(
      "SELECT COUNT(*) AS total FROM devices WHERE assigned_user_id=? AND status='OFF'",
      [userId]
    );

    res.json({
      me,
      devices: {
        total: total.total,
        on: on.total,
        off: off.total
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ADMIN: GREENHOUSE IOT OVERVIEW
 * GET /api/dashboard/greenhouse-overview
 */
router.get("/greenhouse-overview", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    // KPIs
    const [[ghCount]] = await pool.query(`SELECT COUNT(*) AS total FROM greenhouses`);
    const [[secCount]] = await pool.query(`SELECT COUNT(*) AS total FROM greenhouse_sections`);
    const [[devCount]] = await pool.query(`SELECT COUNT(*) AS total FROM devices`);

    // If you don't have device_category, classify by device_type keywords (works with Pump/Light/Sensor etc.)
    const [[sensorCount]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM devices
      WHERE LOWER(device_type) LIKE '%sensor%'
         OR LOWER(device_type) LIKE '%dht%'
         OR LOWER(device_type) LIKE '%soil%'
         OR LOWER(device_type) LIKE '%ph%'
         OR LOWER(device_type) LIKE '%light%'
    `);

    const [[motorCount]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM devices
      WHERE LOWER(device_type) LIKE '%motor%'
         OR LOWER(device_type) LIKE '%pump%'
         OR LOWER(device_type) LIKE '%fan%'
         OR LOWER(device_type) LIKE '%valve%'
    `);

    // Greenhouse list + counts
    const [greenhouses] = await pool.query(`
      SELECT 
        g.id,
        g.name,
        g.total_area_m2,
        g.section_count,
        COUNT(DISTINCT s.id) AS zones,
        COUNT(DISTINCT d.id) AS devices
      FROM greenhouses g
      LEFT JOIN greenhouse_sections s ON s.greenhouse_id = g.id
      LEFT JOIN devices d ON d.greenhouse_id = g.id
      GROUP BY g.id
      ORDER BY g.id DESC
    `);

    // Latest reading per device, then averaged per section (zone)
    const [zoneStatus] = await pool.query(`
      SELECT 
        s.id AS section_id,
        s.greenhouse_id,
        s.section_code,
        AVG(r.temperature) AS avg_temp,
        AVG(r.humidity) AS avg_hum,
        AVG(r.soil_moisture) AS avg_soil,
        MAX(r.created_at) AS last_update
      FROM greenhouse_sections s
      LEFT JOIN devices d ON d.section_id = s.id
      LEFT JOIN (
        SELECT sr.*
        FROM sensor_readings sr
        INNER JOIN (
          SELECT device_id, MAX(id) AS max_id
          FROM sensor_readings
          GROUP BY device_id
        ) last ON last.max_id = sr.id
      ) r ON r.device_id = d.id
      GROUP BY s.id
      ORDER BY s.greenhouse_id DESC, s.section_code ASC
    `);

    res.json({
      kpis: {
        total_greenhouses: ghCount.total,
        total_sections: secCount.total,
        total_devices: devCount.total,
        total_sensors: sensorCount.total,
        total_motors: motorCount.total
      },
      greenhouses,
      zoneStatus
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
