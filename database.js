require('dotenv').config();

let pool = null;

// In-memory fallback store (used when no DATABASE_URL is set)
const mem = {
  profile: {
    id: 1, name: '', jobtitle: '', email: '', phone: '', location: '',
    linkedin: '', website: '', licence: '', summary: '',
    skills: '[]', experience: '[]', education: '[]',
    certs: '', extra: '', cv_name: '', cl_name: '',
    updated_at: new Date().toISOString()
  },
  jobs: [],
  cv_versions: [],
  ai_suggestions: [],
  nextJobId: 1,
  nextCVId: 1,
  nextSuggId: 1,
};

function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

async function initTables() {
  const p = getPool();
  if (!p) return; // in-memory mode

  await p.query(`
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
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO profile (id) VALUES (1) ON CONFLICT DO NOTHING;

    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
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
      auto_apply_status TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cv_versions (
      id SERIAL PRIMARY KEY,
      label TEXT DEFAULT '',
      content TEXT NOT NULL,
      changes TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_suggestions (
      id SERIAL PRIMARY KEY,
      job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
      section TEXT DEFAULT '',
      original_text TEXT DEFAULT '',
      suggested_text TEXT DEFAULT '',
      reason TEXT DEFAULT '',
      impact TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// ── Profile ───────────────────────────────────────────────────────────────────

async function getProfile() {
  const p = getPool();
  if (!p) return { ...mem.profile };
  const { rows } = await p.query('SELECT * FROM profile WHERE id = 1');
  return rows[0] || { ...mem.profile };
}

async function updateProfile(data) {
  const p = getPool();
  const fields = [
    'name','jobtitle','email','phone','location','linkedin','website',
    'licence','summary','skills','experience','education','certs','extra','cv_name','cl_name'
  ];
  const toUpdate = fields.filter(f => data[f] !== undefined);
  if (!toUpdate.length) return getProfile();

  if (!p) {
    toUpdate.forEach(f => { mem.profile[f] = data[f]; });
    mem.profile.updated_at = new Date().toISOString();
    return { ...mem.profile };
  }

  const setClauses = toUpdate.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = toUpdate.map(f => {
    const v = data[f];
    return (Array.isArray(v) || (typeof v === 'object' && v !== null)) ? JSON.stringify(v) : v;
  });
  values.push(new Date());
  await p.query(
    `UPDATE profile SET ${setClauses}, updated_at = $${values.length} WHERE id = 1`,
    values
  );
  return getProfile();
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

async function getJobs() {
  const p = getPool();
  if (!p) return [...mem.jobs].sort((a, b) => b.id - a.id);
  const { rows } = await p.query('SELECT * FROM jobs ORDER BY created_at DESC');
  return rows;
}

async function getJob(id) {
  const p = getPool();
  if (!p) return mem.jobs.find(j => j.id === Number(id)) || null;
  const { rows } = await p.query('SELECT * FROM jobs WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createJob(data) {
  const p = getPool();
  const now = new Date().toISOString().split('T')[0];
  const vals = {
    title: data.title,
    company: data.company,
    sector: data.sector || '',
    location: data.location || '',
    date_applied: data.date_applied || data.date || now,
    status: data.status || 'Applied',
    ats: data.ats || null,
    salary: data.salary || '',
    source: data.source || '',
    interview_date: data.interview_date || data.interviewDate || '',
    url: data.url || '',
    notes: data.notes || '',
    description: data.description || '',
  };

  if (!p) {
    const job = {
      ...vals, id: mem.nextJobId++,
      ats_analysis: '', cv_generated: '', letter_generated: '', auto_apply_status: '',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    mem.jobs.push(job);
    return job;
  }

  const { rows } = await p.query(
    `INSERT INTO jobs (title,company,sector,location,date_applied,status,ats,salary,source,interview_date,url,notes,description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [vals.title, vals.company, vals.sector, vals.location, vals.date_applied,
     vals.status, vals.ats, vals.salary, vals.source, vals.interview_date,
     vals.url, vals.notes, vals.description]
  );
  return rows[0];
}

async function updateJob(id, data) {
  const p = getPool();
  const allowed = [
    'title','company','sector','location','date_applied','status','ats',
    'salary','source','interview_date','url','notes','description',
    'ats_analysis','cv_generated','letter_generated','auto_apply_status'
  ];
  const toUpdate = allowed.filter(f => data[f] !== undefined);
  if (!toUpdate.length) return getJob(id);

  if (!p) {
    const job = mem.jobs.find(j => j.id === Number(id));
    if (!job) return null;
    toUpdate.forEach(f => { job[f] = data[f]; });
    job.updated_at = new Date().toISOString();
    return { ...job };
  }

  const setClauses = toUpdate.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const values = toUpdate.map(f => data[f]);
  values.push(new Date(), id);
  const { rows } = await p.query(
    `UPDATE jobs SET ${setClauses}, updated_at = $${values.length - 1} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return rows[0];
}

async function deleteJob(id) {
  const p = getPool();
  if (!p) { mem.jobs = mem.jobs.filter(j => j.id !== Number(id)); return; }
  await p.query('DELETE FROM jobs WHERE id = $1', [id]);
}

// ── CV Versions ───────────────────────────────────────────────────────────────

async function getCVVersions() {
  const p = getPool();
  if (!p) return [...mem.cv_versions].sort((a, b) => b.id - a.id);
  const { rows } = await p.query('SELECT * FROM cv_versions ORDER BY created_at DESC');
  return rows;
}

async function saveCVVersion(label, content, changes) {
  const p = getPool();
  if (!p) {
    const v = { id: mem.nextCVId++, label, content, changes: changes || '', created_at: new Date().toISOString() };
    mem.cv_versions.push(v);
    return v;
  }
  const { rows } = await p.query(
    'INSERT INTO cv_versions (label, content, changes) VALUES ($1, $2, $3) RETURNING *',
    [label, content, changes || '']
  );
  return rows[0];
}

// ── AI Suggestions ────────────────────────────────────────────────────────────

async function saveSuggestions(jobId, suggestions) {
  const p = getPool();
  if (!p) {
    mem.ai_suggestions = mem.ai_suggestions.filter(
      s => !(s.job_id === Number(jobId) && s.status === 'pending')
    );
    suggestions.forEach(s => {
      mem.ai_suggestions.push({
        id: mem.nextSuggId++, job_id: Number(jobId),
        section: s.section, original_text: s.original, suggested_text: s.suggested,
        reason: s.reason, impact: s.impact || 'medium', status: 'pending',
        created_at: new Date().toISOString(),
      });
    });
    return mem.ai_suggestions.filter(s => s.job_id === Number(jobId));
  }
  await p.query("DELETE FROM ai_suggestions WHERE job_id = $1 AND status = 'pending'", [jobId]);
  for (const s of suggestions) {
    await p.query(
      'INSERT INTO ai_suggestions (job_id,section,original_text,suggested_text,reason,impact) VALUES ($1,$2,$3,$4,$5,$6)',
      [jobId, s.section, s.original, s.suggested, s.reason, s.impact || 'medium']
    );
  }
  const { rows } = await p.query(
    'SELECT * FROM ai_suggestions WHERE job_id = $1 ORDER BY created_at DESC', [jobId]
  );
  return rows;
}

async function updateSuggestion(id, status) {
  const p = getPool();
  if (!p) {
    const s = mem.ai_suggestions.find(s => s.id === Number(id));
    if (s) s.status = status;
    return s;
  }
  const { rows } = await p.query(
    'UPDATE ai_suggestions SET status = $1 WHERE id = $2 RETURNING *', [status, id]
  );
  return rows[0];
}

async function getSuggestions(jobId) {
  const p = getPool();
  if (!p) return mem.ai_suggestions.filter(s => s.job_id === Number(jobId));
  const { rows } = await p.query(
    'SELECT * FROM ai_suggestions WHERE job_id = $1 ORDER BY created_at DESC', [jobId]
  );
  return rows;
}

module.exports = {
  initTables,
  getProfile, updateProfile,
  getJobs, getJob, createJob, updateJob, deleteJob,
  getCVVersions, saveCVVersion,
  saveSuggestions, updateSuggestion, getSuggestions,
};
