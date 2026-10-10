require("dotenv").config();
const db = require("./src/db");
async function run() {
  try {
    const res = await db.query("SELECT * FROM agents WHERE (UPPER(username) = $1 OR UPPER(name) = $1 OR phone = $1) AND is_active = 1", ["8446786687"]);
    console.log("Agent found:", res.rows.length);
  } catch (err) {
    console.error(err);
  }
}
run();
