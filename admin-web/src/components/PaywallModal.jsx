
import React, { useState } from "react";
import { UploadCloud, CheckCircle, X, ShieldAlert } from "lucide-react";
import api from "../utils/api";

const PaywallModal = ({ isOpen, onClose, feeData, onSuccess, payload }) => {
  const [receiptFile, setReceiptFile] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen || !feeData) return null;

  const handleVerify = async () => {
    if (!receiptFile) return setError("Please upload a screenshot of your payment receipt.");
    
    setVerifying(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("receipt", receiptFile);
      formData.append("mru", payload.mru);
      formData.append("year", payload.year);
      formData.append("month", payload.month);
      formData.append("totalAmount", feeData.totalAmount);

      const token = localStorage.getItem("admin_token");
      const res = await fetch(`${api.API_BASE_URL}/admin/assignments/verify-payment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else {
        setError(data.reason || "Verification failed. Ensure amount matches.");
      }
    } catch (err) {
      setError("An error occurred during verification. " + err.message);
    }
    setVerifying(false);
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "400px", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 10px 25px rgba(0,0,0,0.1)" }}>
        
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldAlert size={18} color="#f59e0b" /> Payment Required
          </h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6b7280" }}><X size={20} /></button>
        </div>

        <div style={{ padding: "20px" }}>
          <p style={{ margin: "0 0 16px 0", fontSize: "14px", color: "#4b5563" }}>
            You have <strong>{feeData.readingsCount}</strong> new readings to export. The rate is ?{feeData.rate} per reading.
          </p>
          
          <div style={{ background: "#f3f4f6", padding: "16px", borderRadius: "8px", textAlign: "center", marginBottom: "20px" }}>
            <h1 style={{ margin: 0, fontSize: "32px", color: "#111827" }}>?{feeData.totalAmount}</h1>
            <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#6b7280" }}>Total Amount Due</p>
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
            {feeData.qrUrl ? (
              <img src={feeData.qrUrl} alt="Payment QR" style={{ width: "200px", height: "200px", objectFit: "contain", borderRadius: "8px", border: "1px solid #e5e7eb" }} />
            ) : (
              <div style={{ width: "200px", height: "200px", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "8px" }}>No QR Configured</div>
            )}
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "500", marginBottom: "8px" }}>Upload Payment Screenshot</label>
            <input type="file" accept="image/*" onChange={(e) => setReceiptFile(e.target.files[0])} style={{ width: "100%", fontSize: "13px" }} />
          </div>

          {error && <p style={{ color: "#ef4444", fontSize: "12px", marginBottom: "16px", padding: "8px", background: "#fef2f2", borderRadius: "4px" }}>{error}</p>}

          <button onClick={handleVerify} disabled={verifying} style={{ width: "100%", padding: "12px", background: verifying ? "#9ca3af" : "#2563eb", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "500", cursor: verifying ? "not-allowed" : "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
            {verifying ? "Verifying Payment with AI..." : <><CheckCircle size={16} /> Verify & Unlock Download</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaywallModal;

