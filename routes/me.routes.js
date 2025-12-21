const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", requireAuth, (req, res) => {
  res.json({
    message: "You are authorized ",
    user: req.user
  });
});

module.exports = router;
