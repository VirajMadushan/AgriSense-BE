const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();

// Admin only
router.get("/secret", requireAuth, requireRole("admin"), (req, res) => {
  res.json({ message: "Admin access granted " });
});

module.exports = router;
