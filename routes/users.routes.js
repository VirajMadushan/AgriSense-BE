const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();
router.get("/ping", (req, res) => res.send("USERS ROUTE WORKS ✅"));

/**
 * ADMIN ONLY: Get all users
 * GET /api/users
 */



router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, full_name, email, role, created_at FROM users ORDER BY id DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ADMIN ONLY: Create user
 * POST /api/users
 * body: { full_name, email, password, role }
 */
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { full_name, email, password, role } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ message: "full_name, email, password required" });
    }

    const [existing] = await pool.query("SELECT id FROM users WHERE email=?", [email]);
    if (existing.length) return res.status(409).json({ message: "Email already exists" });

    await pool.query(
      "INSERT INTO users (full_name, email, password, role) VALUES (?,?,?,?)",
      [full_name, email, password, role || "user"]
    );

    res.json({ message: "User created" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ADMIN ONLY: Update user
 * PUT /api/users/:id
 * body: { full_name, email, role, password? }
 */
router.put("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { full_name, email, role, password } = req.body;

    if (!id) return res.status(400).json({ message: "Invalid id" });
    if (!full_name || !email || !role) {
      return res.status(400).json({ message: "full_name, email, role required" });
    }

    // Check email belongs to someone else
    const [existing] = await pool.query("SELECT id FROM users WHERE email=?", [email]);
    if (existing.length && existing[0].id !== id) {
      return res.status(409).json({ message: "Email already exists" });
    }

    if (password && password.trim().length > 0) {
      await pool.query(
        "UPDATE users SET full_name=?, email=?, role=?, password=? WHERE id=?",
        [full_name, email, role, password, id]
      );
    } else {
      await pool.query(
        "UPDATE users SET full_name=?, email=?, role=? WHERE id=?",
        [full_name, email, role, id]
      );
    }

    res.json({ message: "User updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ADMIN ONLY: Delete user
 * DELETE /api/users/:id
 */
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    //  prevent deleting yourself
    if (req.user.userId === id) return res.status(400).json({ message: "Cannot delete your own account" });

    await pool.query("DELETE FROM users WHERE id=?", [id]);
    res.json({ message: "User deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
