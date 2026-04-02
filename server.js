require('dotenv').config();
const path = require('path');
const express = require('express');
const app = require('./app');
const db = require('./database');

const PORT = process.env.PORT || 3000;

// Serve frontend (local dev only — on Vercel, public/ is served as static assets)
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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
