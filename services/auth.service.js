const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const SECRET_KEY = "MYSECRET123";

// Temporary database
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

class AuthService {
  // LOGIN
  login(email, password) {
    const user = users.find(u => u.email === email);
    if (!user) return { error: "User not found" };

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) return { error: "Invalid password" };

    // Create JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    return {
      success: true,
      token,
      role: user.role
    };
  }
}

module.exports = new AuthService();
