const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : null;

    if (!token) {
      return res.status(401).json({ message: "Missing token" });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
   
    req.user = payload; // { userId, role, ... }
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid/expired token" });
  }
}

module.exports = { requireAuth };
