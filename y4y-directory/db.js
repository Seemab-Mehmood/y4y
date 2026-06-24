// db.js — Upgraded to sync lightweight JSON persistence with Render Postgres
const { Pool } = require('pg');

// 1. Connect to your Render PostgreSQL DB
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const DEFAULT_DB = {
  organizations: [],
  collaborations: [],
  invitations: [],
  nextOrgId: 1,
  nextCollabId: 1,
  nextInvId: 1
};

// Internal variable acting as our fast local memory cache
let cachedDb = null;

// Initialize the cloud table and load data into memory on startup
async function initCloudDb() {
  try {
    // Create a storage table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cloud_json_store (
        id INT PRIMARY KEY,
        data TEXT NOT NULL
      );
    `);

    // Try to pull existing records
    const res = await pool.query("SELECT data FROM cloud_json_store WHERE id = 1");
    if (res.rows.length > 0) {
      cachedDb = JSON.parse(res.rows[0].data);
      console.log("🚀 Data loaded successfully from Render Cloud PostgreSQL.");
    } else {
      // First time running? Seed database with empty defaults
      cachedDb = DEFAULT_DB;
      await pool.query(
        "INSERT INTO cloud_json_store (id, data) VALUES (1, $1)",
        [JSON.stringify(DEFAULT_DB)]
      );
      console.log("🌱 Cloud Database initialized with default empty collections.");
    }
  } catch (err) {
    console.error("❌ Failed to connect or initialize Cloud Database. Falling back to empty defaults:", err.message);
    cachedDb = DEFAULT_DB;
  }
}

// Run initialization immediately on server bootup
initCloudDb();

function readDb() {
  // If server is still booting or cloud failed, give it the cache
  return cachedDb || DEFAULT_DB;
}

let writeQueue = Promise.resolve();
function writeDb(data) {
  cachedDb = data; // Instantly update cache so reads are lighting fast

  // Queue up the save to the cloud so concurrent requests don't overlap
  writeQueue = writeQueue.then(async () => {
    try {
      await pool.query(
        "UPDATE cloud_json_store SET data = $1 WHERE id = 1",
        [JSON.stringify(data)]
      );
    } catch (err) {
      console.error("❌ Cloud Sync Error: Failed to save changes to PostgreSQL:", err.message);
    }
  });

  return writeQueue;
}

module.exports = { readDb, writeDb };
module.exports = { readDb, writeDb };
