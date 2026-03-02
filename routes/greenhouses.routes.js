const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

function sectionCode(i) {
  // 0 -> A, 1 -> B ...
  return String.fromCharCode(65 + i);
}

/**
 * ✅ GET /api/greenhouses/with-sections
 * Must be ABOVE "/:id" to avoid route conflict
 */
router.get("/with-sections", requireAuth, async (req, res) => {
  try {
    const role = (req.user?.role || "").toLowerCase();
    const userId = req.user?.userId;

    const where = role === "admin" ? "" : "WHERE g.assigned_user_id = ?";
    const params = role === "admin" ? [] : [userId];

    const [gh] = await pool.query(
      `SELECT g.id, g.name, g.total_area_m2, g.section_count, g.assigned_user_id, g.created_at
       FROM greenhouses g
       ${where}
       ORDER BY g.id DESC`,
      params
    );

    const [sec] = await pool.query(
      `SELECT id, greenhouse_id, section_code, area_m2
       FROM greenhouse_sections
       ORDER BY greenhouse_id DESC, section_code ASC`
    );

    const map = new Map();
    gh.forEach((g) => map.set(g.id, { ...g, sections: [] }));

    sec.forEach((s) => {
      if (map.has(s.greenhouse_id)) {
        map.get(s.greenhouse_id).sections.push(s);
      }
    });

    res.json(Array.from(map.values()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ✅ POST /api/greenhouses
 * Create greenhouse and auto-create zones A..D (or more)
 */
router.post("/", requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { name, total_area_m2, section_count = 4 } = req.body;

    if (!name || !total_area_m2) {
      return res.status(400).json({ message: "name and total_area_m2 are required" });
    }

    const total = Number(total_area_m2);
    const count = Math.max(1, Number(section_count || 4));

    await conn.beginTransaction();

    // who created it (your JWT has userId)
    const assigned_user_id = req.user?.userId || null;

    const [ghRes] = await conn.query(
      `INSERT INTO greenhouses (name, total_area_m2, section_count, assigned_user_id)
       VALUES (?, ?, ?, ?)`,
      [name, total, count, assigned_user_id]
    );

    const greenhouseId = ghRes.insertId;

    // area per section
    const per = Number((total / count).toFixed(2));

    // create sections A.. (based on count)
    for (let i = 0; i < count; i++) {
      const code = sectionCode(i); // A,B,C,D...
      await conn.query(
        `INSERT INTO greenhouse_sections (greenhouse_id, section_code, area_m2)
         VALUES (?, ?, ?)`,
        [greenhouseId, code, per]
      );
    }

    await conn.commit();

    // return greenhouse + sections
    const [ghRows] = await pool.query(`SELECT * FROM greenhouses WHERE id=?`, [greenhouseId]);
    const [secRows] = await pool.query(
      `SELECT * FROM greenhouse_sections WHERE greenhouse_id=? ORDER BY id ASC`,
      [greenhouseId]
    );

    res.json({ greenhouse: ghRows[0], sections: secRows });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    conn.release();
  }
});

/**
 * ✅ GET /api/greenhouses
 * List mine; admin can see all
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const role = (req.user?.role || "").toLowerCase();
    const userId = req.user?.userId;

    const where = role === "admin" ? "" : "WHERE assigned_user_id = ?";
    const params = role === "admin" ? [] : [userId];

    const [rows] = await pool.query(
      `SELECT * FROM greenhouses ${where} ORDER BY id DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ✅ GET /api/greenhouses/:id
 * Details + sections + device counts
 * (keep LAST because it's dynamic)
 */
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    // greenhouse
    const [gh] = await pool.query(`SELECT * FROM greenhouses WHERE id=?`, [id]);
    if (!gh.length) return res.status(404).json({ message: "Not found" });

    // sections + device counts
    const [sections] = await pool.query(
      `
      SELECT 
        s.id,
        s.section_code,
        s.area_m2,
        COUNT(d.id) AS total_devices,
        SUM(CASE WHEN d.device_type = 'sensor' THEN 1 ELSE 0 END) AS sensor_count,
        SUM(CASE WHEN d.device_type = 'motor' THEN 1 ELSE 0 END) AS motor_count
      FROM greenhouse_sections s
      LEFT JOIN devices d ON d.section_id = s.id
      WHERE s.greenhouse_id = ?
      GROUP BY s.id
      ORDER BY s.id ASC
      `,
      [id]
    );

    res.json({ greenhouse: gh[0], sections });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;