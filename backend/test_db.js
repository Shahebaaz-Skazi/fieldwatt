require("dotenv").config();
const db = require("./src/db");
async function run() {
  try {
    const res = await db.query("SELECT DISTINCT status_code FROM readings");
    console.log("Distinct status_code:", res.rows.map(r => r.status_code));
  } catch (err) {
    console.error(err);
  }
}
run();
