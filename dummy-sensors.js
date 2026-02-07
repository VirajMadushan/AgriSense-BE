const pool = require("./db");

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

async function tick() {
  try {
    const [devices] = await pool.query("SELECT id FROM devices");

    for (const d of devices) {
      const temperature = rand(25, 35).toFixed(2);
      const humidity = rand(50, 90).toFixed(2);
      const soil = rand(20, 80).toFixed(2);
      const ph = rand(5.5, 7.5).toFixed(2);
      const light = Math.floor(rand(200, 1500));

      await pool.query(
        `INSERT INTO sensor_readings(device_id, temperature, humidity, soil_moisture, ph, light)
         VALUES (?,?,?,?,?,?)`,
        [d.id, temperature, humidity, soil, ph, light]
      );
    }

    console.log("✅ Dummy sensor readings inserted");
  } catch (err) {
    console.error("❌ Dummy insert error:", err.message);
  }
}

setInterval(tick, 5000);
