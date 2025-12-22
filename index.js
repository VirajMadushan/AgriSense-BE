require("dotenv").config();

const express = require("express");
const cors = require("cors");

// Routes
const authRoutes = require("./routes/auth.routes");
const meRoutes = require("./routes/me.routes");
const adminRoutes = require("./routes/admin.routes");
const usersRoutes = require("./routes/users.routes"); 
const deviceRoters = require("./routes/devices.routes");
const myDevicesRoutes = require("./routes/my-devices.routes");
const deviceControlRoutes = require("./routes/device-control.routes");
//  Create app FIRST
const app = express();

// Middleware
app.use(cors({ origin: "http://localhost:4200" }));
app.use(express.json());

// Health check
app.get("/", (req, res) => res.send("AgriSense BE running "));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/me", meRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/devices",deviceRoters);
app.use("/api/my/devices", myDevicesRoutes);
app.use("/api/device-control", deviceControlRoutes);
// Start server
app.listen(process.env.PORT || 4000, () => {
  console.log(`Server running on port ${process.env.PORT || 4000}`);
});
