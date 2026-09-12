
import { useState, useEffect } from "react";
import axios from "axios";
import { Users, Home, Activity, Database, CheckCircle, RefreshCcw } from "lucide-react";

function App() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const res = await axios.get("http://localhost:4000/api/vendors");
      setVendors(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const totalProperties = vendors.reduce((acc, v) => acc + (v.stats?.properties || 0), 0);
  const totalAgents = vendors.reduce((acc, v) => acc + (v.stats?.agents || 0), 0);
  const totalReadings = vendors.reduce((acc, v) => acc + (v.stats?.readings || 0), 0);

  return (
    <div style={{ padding: "40px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700" }}>FieldWatt Super Admin</h1>
          <p style={{ color: "#6b7280", marginTop: "4px" }}>Global oversight across all active vendors and databases</p>
        </div>
        <button 
          onClick={fetchVendors}
          style={{ padding: "10px 16px", backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "6px", display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: "500", color: "#374151" }}>
          <RefreshCcw size={16} /> Refresh Stats
        </button>
      </div>

      {/* Global Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", marginBottom: "40px" }}>
        <StatCard title="Global Properties" value={totalProperties.toLocaleString()} icon={<Home size={24} color="#3b82f6" />} />
        <StatCard title="Global Agents" value={totalAgents.toLocaleString()} icon={<Users size={24} color="#10b981" />} />
        <StatCard title="Global Readings" value={totalReadings.toLocaleString()} icon={<Activity size={24} color="#8b5cf6" />} />
      </div>

      {/* Vendor List */}
      <h2 style={{ fontSize: "20px", fontWeight: "600", marginBottom: "20px" }}>Active Vendors</h2>
      {loading ? (
        <p>Loading global databases...</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          {vendors.map(v => (
            <div key={v.id} style={{ backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <div>
                  <h3 style={{ fontSize: "18px", fontWeight: "600" }}>{v.name}</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#6b7280", fontSize: "13px", marginTop: "4px" }}>
                    <Database size={14} /> ID: {v.db_id.slice(0, 8)}...
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", backgroundColor: "#dcfce3", color: "#166534", padding: "4px 10px", borderRadius: "100px", fontSize: "12px", fontWeight: "500" }}>
                  <CheckCircle size={14} /> Active
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", borderTop: "1px solid #f3f4f6", paddingTop: "20px" }}>
                <div>
                  <div style={{ color: "#6b7280", fontSize: "12px", textTransform: "uppercase", fontWeight: "600" }}>Properties</div>
                  <div style={{ fontSize: "16px", fontWeight: "600", marginTop: "4px" }}>{v.stats?.properties?.toLocaleString() || 0}</div>
                </div>
                <div>
                  <div style={{ color: "#6b7280", fontSize: "12px", textTransform: "uppercase", fontWeight: "600" }}>Agents</div>
                  <div style={{ fontSize: "16px", fontWeight: "600", marginTop: "4px" }}>{v.stats?.agents?.toLocaleString() || 0}</div>
                </div>
                <div>
                  <div style={{ color: "#6b7280", fontSize: "12px", textTransform: "uppercase", fontWeight: "600" }}>Readings</div>
                  <div style={{ fontSize: "16px", fontWeight: "600", marginTop: "4px" }}>{v.stats?.readings?.toLocaleString() || 0}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon }) {
  return (
    <div style={{ backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ color: "#6b7280", fontSize: "14px", fontWeight: "500" }}>{title}</p>
          <h2 style={{ fontSize: "32px", fontWeight: "700", marginTop: "8px", color: "#111827" }}>{value}</h2>
        </div>
        <div style={{ backgroundColor: "#f3f4f6", padding: "12px", borderRadius: "12px" }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default App;

