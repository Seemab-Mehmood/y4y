// db.js — lightweight JSON-file persistence (no external database required).
// Good enough for a real demo / small-to-medium deployment; swap for Postgres/Mongo later if needed.

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "data", "db.json");

const DEFAULT_DB = {
  organizations: [],
  collaborations: [],
  invitations: [],
  nextOrgId: 1,
  nextCollabId: 1,
  nextInvId: 1
};

function ensureDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("Corrupt db.json, resetting to defaults:", err.message);
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

let writeQueue = Promise.resolve();
function writeDb(data) {
  // Serialize writes so concurrent requests never interleave/corrupt the file.
  writeQueue = writeQueue.then(
    () =>
      new Promise((resolve, reject) => {
        fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), (err) => {
          if (err) return reject(err);
          resolve();
        });
      })
  );
  return writeQueue;
}

module.exports = { readDb, writeDb };
