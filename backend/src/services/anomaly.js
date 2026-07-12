const db = require('../db');

/**
 * Checks if a reading is anomalous by comparing with the previous reading in the DB.
 * Returns { isAnomalous: boolean, reason: string | null }
 */
const detectAnomaly = async (propertyId, readingValue, submittedAt) => {
  if (!readingValue) {
    return { isAnomalous: false, reason: null };
  }

  try {
    const result = await db.query(
      `SELECT r.reading_value 
       FROM readings r
       INNER JOIN assignments a ON r.assignment_id = a.id
       WHERE a.property_id = $1 AND r.submitted_at < $2
       ORDER BY r.submitted_at DESC LIMIT 1`,
      [propertyId, submittedAt]
    );

    if (result.rows.length === 0) {
      return { isAnomalous: false, reason: null };
    }

    const prevValue = parseFloat(result.rows[0].reading_value);
    
    if (readingValue < prevValue) {
      return {
        isAnomalous: true,
        reason: `Current reading (${readingValue}) is lower than the previous reading (${prevValue}).`
      };
    }

    // Flag if reading is abnormally high (e.g. 50% increase or 10x normal, let's keep it simple: 2x increase)
    if (readingValue > prevValue * 2) {
      return {
        isAnomalous: true,
        reason: `Current reading (${readingValue}) is abnormally high compared to previous reading (${prevValue}).`
      };
    }

    return { isAnomalous: false, reason: null };
  } catch (error) {
    console.error('Error detecting reading anomaly:', error);
    return { isAnomalous: false, reason: null };
  }
};

module.exports = {
  detectAnomaly,
};
