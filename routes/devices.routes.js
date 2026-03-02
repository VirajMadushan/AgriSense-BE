const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();

/** =========================
 *  LOG HELPER
 * ========================= */
async function logDevice({ device_id, action, old_value, new_value, note, created_by }) {
  await pool.query(
    `INSERT INTO device_logs (device_id, action, old_value, new_value, note, created_by)
     VALUES (?,?,?,?,?,?)`,
    [device_id, action, old_value || null, new_value || null, note || null, created_by || null]
  );
}

/** =========================
 *  ADMIN: GET ALL DEVICES
 *  GET /api/devices
 * ========================= */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { userId, role } = req.user;

    const sql =
      role === "admin"
        ? `SELECT d.id, d.device_name, d.device_type, d.status, d.location,
                  d.assigned_user_id, u.full_name AS assigned_user_name,
                  d.created_at, d.updated_at
           FROM devices d
           LEFT JOIN users u ON u.id = d.assigned_user_id
           ORDER BY d.id DESC`
        : `SELECT d.id, d.device_name, d.device_type, d.status, d.location,
                  d.assigned_user_id, u.full_name AS assigned_user_name,
                  d.created_at, d.updated_at
           FROM devices d
           LEFT JOIN users u ON u.id = d.assigned_user_id
           WHERE d.assigned_user_id = ?
           ORDER BY d.id DESC`;

    const params = role === "admin" ? [] : [userId];

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


/** =========================
 *  ADMIN: CREATE DEVICE
 *  POST /api/devices
 * ========================= */
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { device_name, device_type, status, assigned_user_id, location } = req.body;

    if (!device_name || !device_type) {
      return res.status(400).json({ message: "device_name and device_type required" });
    }

    const finalStatus = (status || "OFF").toUpperCase();
    const finalAssigned = assigned_user_id || null;
    const finalLocation = location || null;

    const [result] = await pool.query(
      `INSERT INTO devices (device_name, device_type, status, assigned_user_id, location)
       VALUES (?,?,?,?,?)`,
      [device_name, device_type, finalStatus, finalAssigned, finalLocation]
    );

    //  LOG
    await logDevice({
      device_id: result.insertId,
      action: "CREATED",
      old_value: null,
      new_value: `${device_name} (${device_type})`,
      note: `Status=${finalStatus}, Assigned=${finalAssigned || "Unassigned"}`,
      created_by: req.user?.userId
    });

    res.json({ message: "Device created" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/** =========================
 *  ADMIN: UPDATE DEVICE
 *  PUT /api/devices/:id
 * ========================= */
router.put("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { device_name, device_type, status, assigned_user_id, location } = req.body;

    if (!id) return res.status(400).json({ message: "Invalid id" });
    if (!device_name || !device_type) {
      return res.status(400).json({ message: "device_name and device_type required" });
    }

    //  Get old record for comparison (for logs)
    const [oldRows] = await pool.query(`SELECT * FROM devices WHERE id=?`, [id]);
    if (!oldRows.length) return res.status(404).json({ message: "Device not found" });
    const old = oldRows[0];

    const newStatus = (status || "OFF").toUpperCase();
    const newAssigned = assigned_user_id || null;
    const newLocation = location || null;

    await pool.query(
      `UPDATE devices
       SET device_name=?, device_type=?, status=?, assigned_user_id=?, location=?
       WHERE id=?`,
      [device_name, device_type, newStatus, newAssigned, newLocation, id]
    );

    //  LOG EACH CHANGE
    const by = req.user?.userId;

    if (old.device_name !== device_name) {
      await logDevice({
        device_id: id,
        action: "NAME_CHANGE",
        old_value: old.device_name,
        new_value: device_name,
        note: "Admin changed device name",
        created_by: by
      });
    }

    if (old.device_type !== device_type) {
      await logDevice({
        device_id: id,
        action: "TYPE_CHANGE",
        old_value: old.device_type,
        new_value: device_type,
        note: "Admin changed device type",
        created_by: by
      });
    }

    if ((old.status || "").toUpperCase() !== newStatus) {
      await logDevice({
        device_id: id,
        action: "STATUS_CHANGE",
        old_value: old.status,
        new_value: newStatus,
        note: "Admin changed status",
        created_by: by
      });
    }

    const oldAssigned = old.assigned_user_id || null;
    if (oldAssigned !== newAssigned) {
      await logDevice({
        device_id: id,
        action: "ASSIGN_CHANGE",
        old_value: oldAssigned ? String(oldAssigned) : "Unassigned",
        new_value: newAssigned ? String(newAssigned) : "Unassigned",
        note: "Admin changed assigned user",
        created_by: by
      });
    }

    const oldLoc = old.location || null;
    if (oldLoc !== newLocation) {
      await logDevice({
        device_id: id,
        action: "LOCATION_CHANGE",
        old_value: oldLoc || "—",
        new_value: newLocation || "—",
        note: "Admin changed location",
        created_by: by
      });
    }

    res.json({ message: "Device updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/** =========================
 *  ADMIN: DELETE DEVICE
 *  DELETE /api/devices/:id
 * ========================= */
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    // fetch old for log
    const [oldRows] = await pool.query(`SELECT * FROM devices WHERE id=?`, [id]);
    if (!oldRows.length) return res.status(404).json({ message: "Device not found" });
    const old = oldRows[0];

    //  LOG BEFORE DELETE
    await logDevice({
      device_id: id,
      action: "DELETED",
      old_value: old.device_name,
      new_value: null,
      note: "Admin deleted device",
      created_by: req.user?.userId
    });

    await pool.query("DELETE FROM devices WHERE id=?", [id]);
    res.json({ message: "Device deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/** =========================
 *  ADMIN: DEVICE HISTORY
 *  GET /api/devices/:id/history
 * ========================= */
router.get("/:id/history", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [rows] = await pool.query(
      `SELECT dl.id, dl.action, dl.old_value, dl.new_value, dl.note, dl.created_at,
              u.full_name AS created_by_name
       FROM device_logs dl
       LEFT JOIN users u ON u.id = dl.created_by
       WHERE dl.device_id = ?
       ORDER BY dl.id DESC`,
      [id]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ADMIN: DEVICE REPORT (device + last history)
 * GET /api/devices/:id/report
 */
router.get("/:id/report", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    // Device info
    const [deviceRows] = await pool.query(
      `SELECT d.id, d.device_name, d.device_type, d.status, d.location,
              d.assigned_user_id, u.full_name AS assigned_user_name,
              d.created_at, d.updated_at
       FROM devices d
       LEFT JOIN users u ON u.id = d.assigned_user_id
       WHERE d.id = ?`,
      [id]
    );

    if (!deviceRows.length) return res.status(404).json({ message: "Device not found" });
    const device = deviceRows[0];

    // Last 50 logs (you can change limit)
    const [history] = await pool.query(
      `SELECT dl.id, dl.action, dl.old_value, dl.new_value, dl.note, dl.created_at,
              u.full_name AS created_by_name
       FROM device_logs dl
       LEFT JOIN users u ON u.id = dl.created_by
       WHERE dl.device_id = ?
       ORDER BY dl.id DESC
       LIMIT 50`,
      [id]
    );

    res.json({ device, history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


// USER + ADMIN: Toggle device ON/OFF (only if assigned OR admin)
router.post("/:id/toggle", requireAuth, async (req, res) => {
  try {
    const deviceId = Number(req.params.id);
    const userId = req.user.userId;
    const role = req.user.role;

    const [rows] = await pool.query(
      "SELECT id, status, assigned_user_id, device_name FROM devices WHERE id=?",
      [deviceId]
    );

    if (!rows.length) return res.status(404).json({ message: "Device not found" });

    const device = rows[0];

    // user can toggle only own devices; admin can toggle any
    if (role !== "admin" && Number(device.assigned_user_id) !== Number(userId)) {
      return res.status(403).json({ message: "Not allowed to control this device" });
    }

    const current = (device.status || "OFF").toUpperCase();
    const newStatus = current === "ON" ? "OFF" : "ON";

    await pool.query(
      "UPDATE devices SET status=?, updated_at=NOW() WHERE id=?",
      [newStatus, deviceId]
    );

    // LOG the toggle action
    await logDevice({
      device_id: deviceId,
      action: "USER_TOGGLE",
      old_value: current,
      new_value: newStatus,
      note: role === "admin" ? "Admin toggled device" : "User toggled device",
      created_by: userId
    });

    res.json({ message: "Device updated", status: newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/** =========================
 *  ADMIN: ASSIGN DEVICE TO SECTION
 *  PATCH /api/devices/:id/assign
 * ========================= */
router.patch("/:id/assign", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const deviceId = Number(req.params.id);
    const { greenhouse_id, section_id } = req.body;

    if (!deviceId) return res.status(400).json({ message: "Invalid device id" });

    // Check device exists
    const [oldRows] = await pool.query(
      "SELECT * FROM devices WHERE id=?",
      [deviceId]
    );
    if (!oldRows.length) return res.status(404).json({ message: "Device not found" });

    const old = oldRows[0];

    // Update device
    await pool.query(
      "UPDATE devices SET greenhouse_id=?, section_id=? WHERE id=?",
      [greenhouse_id || null, section_id || null, deviceId]
    );

    // Log assignment
    await logDevice({
      device_id: deviceId,
      action: "SECTION_ASSIGN",
      old_value: old.section_id ? String(old.section_id) : "Unassigned",
      new_value: section_id ? String(section_id) : "Unassigned",
      note: `Assigned to greenhouse ${greenhouse_id || "None"}`,
      created_by: req.user?.userId
    });

    res.json({ message: "Device assigned to section successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});




module.exports = router;
