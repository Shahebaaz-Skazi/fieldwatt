
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
        } catch (e) {}
        return { ...v, stats };
      })
    );
    
    res.json(vendorsWithStats);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

// Get Billing Settings
app.get("/api/vendors/:id/billing", async (req, res) => {
  try {
    const vendors = await queryD1(MASTER_DB_ID, "SELECT * FROM vendors WHERE id = ?", [req.params.id]);
    if (!vendors || vendors.length === 0) return res.status(404).json({ error: "Vendor not found" });
    
    const settings = await queryD1(vendors[0].db_id, "SELECT * FROM settings");
    const config = {
      paywall_enabled: false,
      paywall_rate: 0,
      payment_qr: ""
    };
    
    if (settings) {
      settings.forEach(s => {
        if (s.key === "PAYWALL_ENABLED") config.paywall_enabled = s.value === "true";
        if (s.key === "PAYWALL_RATE") config.paywall_rate = parseFloat(s.value);
        if (s.key === "PAYMENT_QR") config.payment_qr = s.value;
      });
    }
    
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch billing" });
  }
});

// Update Billing Settings
app.post("/api/vendors/:id/billing", async (req, res) => {
  try {
    const vendors = await queryD1(MASTER_DB_ID, "SELECT * FROM vendors WHERE id = ?", [req.params.id]);
    if (!vendors || vendors.length === 0) return res.status(404).json({ error: "Vendor not found" });
    
    const { paywall_enabled, paywall_rate, payment_qr } = req.body;
    const dbId = vendors[0].db_id;
    
    await queryD1(dbId, "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", ["PAYWALL_ENABLED", paywall_enabled ? "true" : "false"]);
    await queryD1(dbId, "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", ["PAYWALL_RATE", paywall_rate.toString()]);
    await queryD1(dbId, "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", ["PAYMENT_QR", payment_qr || ""]);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update billing" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Super Admin API running on port ${PORT}`);
});

