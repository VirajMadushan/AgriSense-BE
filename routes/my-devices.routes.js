const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();

// USER: Get my assigned devices
router.get("/", requireAuth, requireRole("user", "admin"), async (req, res) => {
  try {
    const userId = req.user.userId;

    const [rows] = await pool.query(
      `SELECT id, device_name, device_type, status, location, assigned_user_id, created_at, updated_at
       FROM devices
       WHERE assigned_user_id = ?
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
