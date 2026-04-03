const app = require('../app');
const db = require('../database');

let initPromise = null;

function ensureInit() {
  if (!initPromise) initPromise = db.initTables();
  return initPromise;
}

module.exports = async (req, res) => {
  await ensureInit();
  return app(req, res);
};
