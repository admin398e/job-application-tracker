const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/profile
router.get('/', async (req, res) => {
  try {
    const profile = await db.getProfile();
    ['skills', 'experience', 'education'].forEach(f => {
      if (typeof profile[f] === 'string') {
        try { profile[f] = JSON.parse(profile[f]); } catch { profile[f] = []; }
      }
    });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/profile
router.put('/', async (req, res) => {
  try {
    const data = req.body;
    ['skills', 'experience', 'education'].forEach(f => {
      if (Array.isArray(data[f])) data[f] = JSON.stringify(data[f]);
    });
    const updated = await db.updateProfile(data);
    ['skills', 'experience', 'education'].forEach(f => {
      if (typeof updated[f] === 'string') {
        try { updated[f] = JSON.parse(updated[f]); } catch { updated[f] = []; }
      }
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
