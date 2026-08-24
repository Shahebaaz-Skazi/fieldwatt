/**
 * Cloudflare D1 unified DB client wrapper.
 * Replaces the old pg pool client to redirect all codebase queries to D1.
 * Supports:
 *   - db.query(sql, params)
 *   - db.batch(statements)
 *   - db.pool.connect() -> MockClient for sequential/transaction-like routes
 */
const d1 = require('./utils/db');

class MockClient {
  async query(sql, params = []) {
    // SQLite/D1 doesn't support stateful transaction states over REST;
    // We safely ignore transaction bounds (SQLite autocommits anyway)
    const upper = sql.trim().toUpperCase();
    if (upper === 'BEGIN' || upper === 'COMMIT' || upper === 'ROLLBACK') {
      return { rows: [], rowCount: 0 };
    }
    return d1.query(sql, params);
  }
  release() {}
}

const mockPool = {
  connect: async () => new MockClient(),
  on: () => {},
  end: async () => {},
};

module.exports = {
  query: (text, params) => d1.query(text, params),
  batch: (statements) => d1.batch(statements),
  pool: mockPool,
};
