const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();

/**
 * POST /api/device-control/:id/toggle
 * body: { status: "ON" | "OFF" }
 */
router.post("/:id/toggle", requireAuth, requireRole("user", "admin"), async (req, res) => {
  try {
    const deviceId = Number(req.params.id);
    const status = (req.body.status || "").toUpperCase();

    if (!deviceId) return res.status(400).json({ message: "Invalid device id" });
    if (!["ON", "OFF"].includes(status)) {
      return res.status(400).json({ message: "status must be ON or OFF" });
    }

    // Admin can toggle any device; user can toggle only assigned devices
    const role = (req.user.role || "").toLowerCase();
    const userId = req.user.userId;

    if (role === "user") {
      const [check] = await pool.query(
        "SELECT id FROM devices WHERE id=? AND assigned_user_id=?",
        [deviceId, userId]
      );
      if (!check.length) return res.status(403).json({ message: "Forbidden" });
    }

    await pool.query("UPDATE devices SET status=? WHERE id=?", [status, deviceId]);

    res.json({ message: "Device status updated", status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
