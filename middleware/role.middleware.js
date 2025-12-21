function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = (req.user?.role || "").toLowerCase();

    if (!role) {
      return res.status(403).json({ message: "Role not found" });
    }

    if (!allowedRoles.map(r => r.toLowerCase()).includes(role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
}

module.exports = { requireRole };
