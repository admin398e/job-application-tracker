require('dotenv').config();
const app = require('./app');
const db = require('./database');

const PORT = process.env.PORT || 3000;

db.initTables()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Job Application Tracker running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.warn('DB init warning (using in-memory):', err.message);
    app.listen(PORT, () => {
      console.log(`Job Application Tracker running at http://localhost:${PORT} (in-memory mode)`);
    });
  });
