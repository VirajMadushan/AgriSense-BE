const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

/**
 * USER: Get my assigned devices
 * GET /api/my/devices
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

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
