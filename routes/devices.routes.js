const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();

/**
 * ADMIN: Get all devices
 * GET /api/devices
 */
router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.id, d.device_name, d.device_type, d.status, d.location,
              d.assigned_user_id, u.full_name AS assigned_user_name,
              d.created_at, d.updated_at
       FROM devices d
       LEFT JOIN users u ON u.id = d.assigned_user_id
       ORDER BY d.id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ADMIN: Create device
 * POST /api/devices
 */
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { device_name, device_type, status, assigned_user_id, location } = req.body;

    if (!device_name || !device_type) {
      return res.status(400).json({ message: "device_name and device_type required" });
    }

    await pool.query(
      `INSERT INTO devices (device_name, device_type, status, assigned_user_id, location)
       VALUES (?,?,?,?,?)`,
      [
        device_name,
        device_type,
        (status || "OFF").toUpperCase(),
        assigned_user_id || null,
        location || null
      ]
    );

    res.json({ message: "Device created" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ADMIN: Update device
 * PUT /api/devices/:id
 */
router.put("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { device_name, device_type, status, assigned_user_id, location } = req.body;

    if (!id) return res.status(400).json({ message: "Invalid id" });
    if (!device_name || !device_type) {
      return res.status(400).json({ message: "device_name and device_type required" });
    }

    await pool.query(
      `UPDATE devices
       SET device_name=?, device_type=?, status=?, assigned_user_id=?, location=?
       WHERE id=?`,
      [
        device_name,
        device_type,
        (status || "OFF").toUpperCase(),
        assigned_user_id || null,
        location || null,
        id
      ]
    );

    res.json({ message: "Device updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ADMIN: Delete device
 * DELETE /api/devices/:id
 */
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    await pool.query("DELETE FROM devices WHERE id=?", [id]);
    res.json({ message: "Device deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
