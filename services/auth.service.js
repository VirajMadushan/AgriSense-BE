const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const SECRET_KEY = "MYSECRET123"; // Change for production

// TEMP USERS (You can later replace with DB)
const users = [
  {
    id: 1,
    email: "admin@gmail.com",
    password: bcrypt.hashSync("admin123", 10),
    role: "admin"
  },
  {
    id: 2,
    email: "user@gmail.com",
    password: bcrypt.hashSync("user123", 10),
    role: "user"
  }
];

// ----------------------
// LOGIN API
// ----------------------
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;

  const user = users.find(u => u.email === email);

  if (!user) {
    return res.status(400).json({ message: "User not found" });
  }

  const isMatch = bcrypt.compareSync(password, user.password);
  if (!isMatch) {
    return res.status(400).json({ message: "Invalid password" });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    SECRET_KEY,
    { expiresIn: "1h" }
  );

  res.json({
    success: true,
    token,
    role: user.role
  });
});

// ----------------------
// VERIFY TOKEN (PROTECTED ROUTE)
// ----------------------
app.get("/api/protected", (req, res) => {
  const token = req.headers["authorization"];

  if (!token) return res.status(403).json({ message: "Token missing" });

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    res.json({ message: "Valid token", user: decoded });
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
});

// ----------------------
app.listen(4000, () => {
  console.log("Backend running on http://localhost:4000");
});
