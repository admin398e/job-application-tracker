const app = require('../app');
const db = require('../database');

let initPromise = null;

function ensureInit() {
  if (!initPromise) {
    initPromise = db.initTables().catch(err => {
      console.error('DB init error:', err.message);
      initPromise = null; // reset so next request can retry
    });
  }
  return initPromise;
}

module.exports = async (req, res) => {
  await ensureInit();
  return app(req, res);
};
