const express = require('express');
const router = express.Router();
const db = require('../database');
const scraper = require('../services/scraper');

// GET /api/jobs/search?q=...&location=...&radius=...&maxAge=...&jobType=...&limit=...
router.get('/search', async (req, res) => {
  try {
    const { q, location, radius, maxAge, jobType, limit } = req.query;
    if (!q) return res.status(400).json({ error: 'Search query required' });
    const results = await scraper.searchJobs({ query: q, location, radius, maxAge, jobType, limit });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message, results: [] });
  }
});

// GET /api/jobs
router.get('/', async (req, res) => {
  try {
    res.json(await db.getJobs());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/:id
router.get('/:id', async (req, res) => {
  try {
    const job = await db.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs
router.post('/', async (req, res) => {
  try {
    const { title, company } = req.body;
    if (!title || !company) return res.status(400).json({ error: 'Title and company required' });
    const job = await db.createJob(req.body);
    res.status(201).json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/jobs/:id
router.put('/:id', async (req, res) => {
  try {
    const job = await db.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const updated = await db.updateJob(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/jobs/:id
router.delete('/:id', async (req, res) => {
  try {
    const job = await db.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    await db.deleteJob(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
