const express = require('express');
const router = express.Router();
const db = require('../database');
const aiService = require('../services/ai');
const generator = require('../services/generator');
const archiver = require('archiver');

function parseProfile(profile) {
  ['skills', 'experience', 'education'].forEach(f => {
    if (typeof profile[f] === 'string') {
      try { profile[f] = JSON.parse(profile[f]); } catch { profile[f] = []; }
    }
  });
  return profile;
}

// POST /api/ai/score  – ATS score a job against the user's CV
router.post('/score', async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId required' });
    const job = db.getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const profile = parseProfile(db.getProfile());
    const result = await aiService.scoreCV(profile, job);
    // Save score back to job
    db.updateJob(jobId, { ats: result.score, ats_analysis: JSON.stringify(result) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/suggest  – Get edit suggestions
router.post('/suggest', async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId required' });
    const job = db.getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const profile = parseProfile(db.getProfile());
    const suggestions = await aiService.suggestEdits(profile, job);
    const saved = db.saveSuggestions(jobId, suggestions);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/suggestions/:jobId
router.get('/suggestions/:jobId', (req, res) => {
  try {
    res.json(db.getSuggestions(req.params.jobId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/suggestion/:id/approve
router.post('/suggestion/:id/approve', (req, res) => {
  try {
    res.json(db.updateSuggestion(req.params.id, 'approved'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/suggestion/:id/reject
router.post('/suggestion/:id/reject', (req, res) => {
  try {
    res.json(db.updateSuggestion(req.params.id, 'rejected'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/apply-edits  – Apply approved suggestions to profile
router.post('/apply-edits', async (req, res) => {
  try {
    const { jobId } = req.body;
    const suggestions = db.getSuggestions(jobId).filter(s => s.status === 'approved');
    if (!suggestions.length) return res.status(400).json({ error: 'No approved suggestions' });
    const profile = parseProfile(db.getProfile());
    const updated = await aiService.applyEdits(profile, suggestions);
    // Save CV version before applying
    const cvText = aiService.profileToCVText(profile);
    db.saveCVVersion(`Before job #${jobId} edits`, cvText, `Auto-saved before applying ${suggestions.length} AI suggestions`);
    // Update profile
    db.updateProfile({ summary: updated.summary, skills: JSON.stringify(updated.skills), experience: JSON.stringify(updated.experience) });
    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/generate-cv
router.post('/generate-cv', async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId required' });
    const job = db.getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const profile = parseProfile(db.getProfile());
    const cvText = await aiService.generateCV(profile, job);
    db.updateJob(jobId, { cv_generated: cvText });
    res.json({ content: cvText });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/generate-letter
router.post('/generate-letter', async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId required' });
    const job = db.getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const profile = parseProfile(db.getProfile());
    const letterText = await aiService.generateCoverLetter(profile, job);
    db.updateJob(jobId, { letter_generated: letterText });
    res.json({ content: letterText });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/download/:jobId/cv  – Download generated CV as .docx
router.get('/download/:jobId/cv', async (req, res) => {
  try {
    const job = db.getJob(req.params.jobId);
    if (!job || !job.cv_generated) return res.status(404).json({ error: 'No generated CV for this job' });
    const profile = parseProfile(db.getProfile());
    const buffer = await generator.createCVDoc(profile, job.cv_generated);
    const filename = `CV_${job.company.replace(/[^a-z0-9]/gi,'_')}_${job.title.replace(/[^a-z0-9]/gi,'_')}.docx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/download/:jobId/letter  – Download generated cover letter as .docx
router.get('/download/:jobId/letter', async (req, res) => {
  try {
    const job = db.getJob(req.params.jobId);
    if (!job || !job.letter_generated) return res.status(404).json({ error: 'No generated cover letter for this job' });
    const profile = parseProfile(db.getProfile());
    const buffer = await generator.createLetterDoc(profile, job, job.letter_generated);
    const filename = `CoverLetter_${job.company.replace(/[^a-z0-9]/gi,'_')}_${job.title.replace(/[^a-z0-9]/gi,'_')}.docx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/mass-generate  – Generate CV + letter for multiple jobs
router.post('/mass-generate', async (req, res) => {
  const { jobIds } = req.body;
  if (!Array.isArray(jobIds) || !jobIds.length) return res.status(400).json({ error: 'jobIds array required' });
  const profile = parseProfile(db.getProfile());
  const results = [];
  for (const jobId of jobIds) {
    const job = db.getJob(jobId);
    if (!job) { results.push({ jobId, error: 'Not found' }); continue; }
    try {
      const [cvText, letterText] = await Promise.all([
        aiService.generateCV(profile, job),
        aiService.generateCoverLetter(profile, job)
      ]);
      db.updateJob(jobId, { cv_generated: cvText, letter_generated: letterText });
      results.push({ jobId, success: true, title: job.title, company: job.company });
    } catch (err) {
      results.push({ jobId, error: err.message, title: job.title, company: job.company });
    }
  }
  res.json(results);
});

// GET /api/ai/download-zip?jobs=1,2,3  – Download all docs as ZIP
router.get('/download-zip', async (req, res) => {
  try {
    const jobIds = (req.query.jobs || '').split(',').map(Number).filter(Boolean);
    if (!jobIds.length) return res.status(400).json({ error: 'jobs query param required' });
    const profile = parseProfile(db.getProfile());
    res.setHeader('Content-Disposition', 'attachment; filename="job_applications.zip"');
    res.setHeader('Content-Type', 'application/zip');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    for (const jobId of jobIds) {
      const job = db.getJob(jobId);
      if (!job) continue;
      const slug = `${job.company}_${job.title}`.replace(/[^a-z0-9]/gi,'_').substring(0,40);
      if (job.cv_generated) {
        const cvBuf = await generator.createCVDoc(profile, job.cv_generated);
        archive.append(cvBuf, { name: `${slug}/CV_${slug}.docx` });
      }
      if (job.letter_generated) {
        const letBuf = await generator.createLetterDoc(profile, job, job.letter_generated);
        archive.append(letBuf, { name: `${slug}/CoverLetter_${slug}.docx` });
      }
    }
    await archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
