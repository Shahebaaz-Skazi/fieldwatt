
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, MASTER_DB_ID } = process.env;

async function queryD1(dbId, sql, params = []) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${dbId}/query`;
  try {
    const res = await axios.post(
      endpoint,
      { sql, params },
      { headers: { Authorization: "Bearer " + CLOUDFLARE_API_TOKEN, "Content-Type": "application/json" } }
    );
    if (!res.data.success) throw new Error(JSON.stringify(res.data.errors));
    return res.data.result[0].results;
  } catch (err) {
    console.error(`D1 Query failed for DB ${dbId}:`, err.response ? err.response.data : err.message);
    return null;
  }
}

app.get("/api/vendors", async (req, res) => {
  try {
    const vendors = await queryD1(MASTER_DB_ID, "SELECT * FROM vendors");
    
    // Fetch stats for each vendor
    const vendorsWithStats = await Promise.all(
      vendors.map(async (v) => {
        let stats = { properties: 0, agents: 0, readings: 0 };
        
        try {
          const statsRes = await queryD1(
            v.db_id,
            "SELECT (SELECT COUNT(*) FROM properties) as properties, (SELECT COUNT(*) FROM agents) as agents, (SELECT COUNT(*) FROM readings) as readings"
          );
          if (statsRes && statsRes[0]) {
            stats = statsRes[0];
          }
        } catch (e) {
          // ignore stat fetch error for a single vendor if it is down
        }
        
        return { ...v, stats };
      })
    );
    
    res.json(vendorsWithStats);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Super Admin API running on port ${PORT}`);
});

