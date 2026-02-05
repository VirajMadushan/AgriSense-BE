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


module.exports = router;
