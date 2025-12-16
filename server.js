const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Load Routes
const authRoutes = require("./routes/auth.routes");

// Use routes
app.use("/api/auth", authRoutes);

app.listen(4000, () => {
  console.log("Backend running on http://localhost:4000");
});
