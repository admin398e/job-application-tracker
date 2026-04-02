const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'app.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY DEFAULT 1,
      name TEXT DEFAULT '',
      jobtitle TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      location TEXT DEFAULT '',
      linkedin TEXT DEFAULT '',
      website TEXT DEFAULT '',
      licence TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      skills TEXT DEFAULT '[]',
      experience TEXT DEFAULT '[]',
      education TEXT DEFAULT '[]',
      certs TEXT DEFAULT '',
      extra TEXT DEFAULT '',
      cv_name TEXT DEFAULT '',
      cl_name TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO profile (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      sector TEXT DEFAULT '',
      location TEXT DEFAULT '',
      date_applied TEXT DEFAULT '',
      status TEXT DEFAULT 'Applied',
      ats INTEGER,
      salary TEXT DEFAULT '',
      source TEXT DEFAULT '',
      interview_date TEXT DEFAULT '',
      url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      description TEXT DEFAULT '',
      ats_analysis TEXT DEFAULT '',
      cv_generated TEXT DEFAULT '',
      letter_generated TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cv_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT DEFAULT '',
      content TEXT NOT NULL,
      changes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      section TEXT DEFAULT '',
      original_text TEXT DEFAULT '',
      suggested_text TEXT DEFAULT '',
      reason TEXT DEFAULT '',
      impact TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );
  `);
}

// Profile
function getProfile() {
  return getDb().prepare('SELECT * FROM profile WHERE id = 1').get();
}

function updateProfile(data) {
  const fields = ['name','jobtitle','email','phone','location','linkedin','website',
    'licence','summary','skills','experience','education','certs','extra','cv_name','cl_name'];
  const updates = fields.filter(f => data[f] !== undefined)
    .map(f => `${f} = ?`).join(', ');
  const values = fields.filter(f => data[f] !== undefined).map(f => {
    const v = data[f];
    return (Array.isArray(v) || typeof v === 'object') ? JSON.stringify(v) : v;
  });
  if (!updates) return getProfile();
  getDb().prepare(`UPDATE profile SET ${updates}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`)
    .run(...values);
  return getProfile();
}

// Jobs
function getJobs() {
  return getDb().prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
}

function getJob(id) {
  return getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id);
}

function createJob(data) {
  const stmt = getDb().prepare(`
    INSERT INTO jobs (title, company, sector, location, date_applied, status, ats, salary, source, interview_date, url, notes, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.title, data.company, data.sector || '', data.location || '',
    data.date_applied || data.date || new Date().toISOString().split('T')[0],
    data.status || 'Applied', data.ats || null, data.salary || '',
    data.source || '', data.interview_date || data.interviewDate || '',
    data.url || '', data.notes || '', data.description || ''
  );
  return getJob(result.lastInsertRowid);
}

function updateJob(id, data) {
  const allowed = ['title','company','sector','location','date_applied','status','ats',
    'salary','source','interview_date','url','notes','description','ats_analysis',
    'cv_generated','letter_generated'];
  const updates = allowed.filter(f => data[f] !== undefined).map(f => `${f} = ?`).join(', ');
  const values = allowed.filter(f => data[f] !== undefined).map(f => data[f]);
  if (!updates) return getJob(id);
  getDb().prepare(`UPDATE jobs SET ${updates}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(...values, id);
  return getJob(id);
}

function deleteJob(id) {
  getDb().prepare('DELETE FROM jobs WHERE id = ?').run(id);
}

// CV Versions
function getCVVersions() {
  return getDb().prepare('SELECT * FROM cv_versions ORDER BY created_at DESC').all();
}

function saveCVVersion(label, content, changes) {
  const result = getDb().prepare(
    'INSERT INTO cv_versions (label, content, changes) VALUES (?, ?, ?)'
  ).run(label, content, changes || '');
  return getDb().prepare('SELECT * FROM cv_versions WHERE id = ?').get(result.lastInsertRowid);
}

// AI Suggestions
function saveSuggestions(jobId, suggestions) {
  // Clear existing pending suggestions for this job
  getDb().prepare("DELETE FROM ai_suggestions WHERE job_id = ? AND status = 'pending'").run(jobId);
  const stmt = getDb().prepare(
    'INSERT INTO ai_suggestions (job_id, section, original_text, suggested_text, reason, impact) VALUES (?, ?, ?, ?, ?, ?)'
  );
  suggestions.forEach(s => stmt.run(jobId, s.section, s.original, s.suggested, s.reason, s.impact || 'medium'));
  return getDb().prepare('SELECT * FROM ai_suggestions WHERE job_id = ?').all(jobId);
}

function updateSuggestion(id, status) {
  getDb().prepare('UPDATE ai_suggestions SET status = ? WHERE id = ?').run(status, id);
  return getDb().prepare('SELECT * FROM ai_suggestions WHERE id = ?').get(id);
}

function getSuggestions(jobId) {
  return getDb().prepare('SELECT * FROM ai_suggestions WHERE job_id = ? ORDER BY created_at DESC').all(jobId);
}

module.exports = {
  getDb, getProfile, updateProfile,
  getJobs, getJob, createJob, updateJob, deleteJob,
  getCVVersions, saveCVVersion,
  saveSuggestions, updateSuggestion, getSuggestions
};
