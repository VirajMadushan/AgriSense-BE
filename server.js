require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");

const app = express();
app.use(cors({ origin: "http://localhost:4200" }));
app.use(express.json());

app.use("/api/auth", authRoutes);

app.get("/", (req, res) => res.send("AgriSense backend running"));

app.listen(process.env.PORT || 4000, () => {
  console.log(`Server running on port ${process.env.PORT || 4000}`);
});
