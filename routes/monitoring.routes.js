const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

/**
 * LIVE: latest reading per device
 * GET /api/monitoring/live
 */
router.get("/live", requireAuth, async (req, res) => {
  try {
    // adjust these depending on how you store user data in your JWT middleware
    const role = (req.user?.role || "").toLowerCase();       // e.g. "admin"
    const userId = req.user?.userId;        // e.g. 1

    const whereClause = role === "admin" ? "" : "WHERE d.assigned_user_id = ?";
    const params = role === "admin" ? [] : [userId];

    const [rows] = await pool.query(
      `
      SELECT d.id AS device_id, d.device_name, d.device_type, d.status, d.location,
             r.temperature, r.humidity, r.soil_moisture, r.ph, r.light, r.created_at
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

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});



router.get("/device/:id", requireAuth, async (req, res) => {
  try {
    const deviceId = Number(req.params.id);
    const role = (req.user?.role || "").toLowerCase();
    const userId = req.user?.userId;

    // if not admin, check device belongs to user
    if (role !== "admin") {
      const [check] = await pool.query(
        "SELECT id FROM devices WHERE id=? AND assigned_user_id=?",
        [deviceId, userId]
      );
      if (check.length === 0) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    const [rows] = await pool.query(
      `
      SELECT temperature, humidity, soil_moisture, ph, light, created_at
      FROM sensor_readings
      WHERE device_id=?
      ORDER BY id DESC
      LIMIT 50
      `,
      [deviceId]
    );

    res.json(rows.reverse());
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;