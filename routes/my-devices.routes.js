const express = require("express");
const pool = require("../db");

const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();

/**
 * GET /api/my/devices
 * User sees only assigned devices (Admin can also access if you want)
 */
router.get("/", requireAuth, requireRole("user", "admin"), async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;

    // Admin can see ALL devices OR still only their assigned devices.
    // Choose behavior:
    // 1) Admin sees all:
    if (role === "admin") {
      const [rows] = await pool.query(
        `SELECT id, device_name, device_type, status, location, assigned_user_id, updated_at
         FROM devices
         ORDER BY id DESC`
      );
      return res.json(rows);
    }

    // 2) Normal user sees only assigned devices:
    const [rows] = await pool.query(
      `SELECT id, device_name, device_type, status, location, updated_at
       FROM devices
       WHERE assigned_user_id=?
       ORDER BY id DESC`,
      [userId]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
