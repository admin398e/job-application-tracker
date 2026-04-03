/**
 * AI Service — Claude API integration
 * Handles ATS scoring, edit suggestions, CV generation, cover letter generation
 */

const Anthropic = require('@anthropic-ai/sdk');

let client;
function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set in .env');
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const MODEL = 'claude-sonnet-4-6';

async function callClaude(prompt, system, maxTokens = 2048) {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }]
  });
  return response.content[0].text;
}

function profileToCVText(profile) {
  const skills = Array.isArray(profile.skills) ? profile.skills.join(', ') : profile.skills || '';
  const experience = (Array.isArray(profile.experience) ? profile.experience : [])
    .map(e => `${e.title} at ${e.company} (${e.start}–${e.end})\n${e.desc}`)
    .join('\n\n');
  const education = (Array.isArray(profile.education) ? profile.education : [])
    .map(e => `${e.qual}${e.institution ? ' — ' + e.institution : ''} (${e.year})`)
    .join('\n');

  return `NAME: ${profile.name}
CONTACT: ${profile.email} | ${profile.phone} | ${profile.location}
LINKEDIN: ${profile.linkedin || 'N/A'}

PROFILE SUMMARY:
${profile.summary}

KEY SKILLS:
${skills}

WORK EXPERIENCE:
${experience}

EDUCATION:
${education}

CERTIFICATIONS:
${profile.certs || 'N/A'}

ADDITIONAL INFO:
${profile.extra || 'N/A'}`;
}

async function scoreCV(profile, job) {
  const cvText = profileToCVText(profile);
  const jobDesc = job.description || `${job.title} at ${job.company} in ${job.location}. Salary: ${job.salary || 'not specified'}.`;

  const system = 'You are an expert ATS (Applicant Tracking System) analyst and recruitment specialist. Always respond with valid JSON only, no markdown.';
  const prompt = `Analyse this CV against the job description and return a JSON object.

JOB TITLE: ${job.title}
COMPANY: ${job.company}
JOB DESCRIPTION:
${jobDesc}

CANDIDATE CV:
${cvText}

Return ONLY this JSON structure (no markdown, no extra text):
{
  "score": <integer 0-100>,
  "matched_keywords": [<string>],
  "missing_keywords": [<string>],
  "strengths": [<string>],
  "gaps": [<string>],
  "summary": "<2-3 sentence overall assessment>"
}`;

  const raw = await callClaude(prompt, system, 1024);
  try {
    return JSON.parse(raw.trim());
  } catch {
    // Try to extract JSON from response
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return { score: 0, matched_keywords: [], missing_keywords: [], strengths: [], gaps: [], summary: raw };
  }
}

async function suggestEdits(profile, job) {
  const cvText = profileToCVText(profile);
  const jobDesc = job.description || `${job.title} at ${job.company}.`;

  const system = 'You are an expert CV writer and career coach. Always respond with valid JSON only, no markdown.';
  const prompt = `Analyse this CV against the job description and suggest specific, actionable edits to improve ATS score and relevance.

JOB: ${job.title} at ${job.company}
JOB DESCRIPTION:
${jobDesc}

CURRENT CV:
${cvText}

Return ONLY this JSON (no markdown):
{
  "suggestions": [
    {
      "section": "<e.g. summary|skills|experience|education>",
      "original": "<exact text to replace, or empty if adding new>",
      "suggested": "<improved text>",
      "reason": "<why this edit helps>",
      "impact": "<high|medium|low>"
    }
  ]
}

Provide 5-8 specific, high-impact suggestions. Focus on:
1. Adding missing keywords naturally
2. Quantifying achievements
3. Aligning job titles/descriptions with the role
4. Highlighting transferable skills`;

  const raw = await callClaude(prompt, system, 2048);
  try {
    const parsed = JSON.parse(raw.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
    return parsed.suggestions || [];
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const obj = JSON.parse(match[0]);
      return obj.suggestions || [];
    }
    return [];
  }
}

async function applyEdits(profile, suggestions) {
  const cvText = profileToCVText(profile);
  const editsText = suggestions.map((s, i) =>
    `${i+1}. Section: ${s.section}\n   Original: ${s.original_text}\n   Replace with: ${s.suggested_text}`
  ).join('\n\n');

  const system = 'You are an expert CV editor. Always respond with valid JSON only, no markdown.';
  const prompt = `Apply these approved edits to the CV and return the updated profile fields.

CURRENT CV:
${cvText}

APPROVED EDITS TO APPLY:
${editsText}

Return ONLY this JSON with the updated fields:
{
  "summary": "<updated summary>",
  "skills": [<updated skills array>],
  "experience": [
    {
      "title": "<title>",
      "company": "<company>",
      "start": "<start>",
      "end": "<end>",
      "desc": "<updated description>"
    }
  ]
}`;

  const raw = await callClaude(prompt, system, 2048);
  try {
    return JSON.parse(raw.trim().replace(/^```json\n?/, '').replace(/\n?```$/, ''));
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not parse AI response');
  }
}

async function generateCV(profile, job) {
  const cvText = profileToCVText(profile);
  const jobDesc = job.description || `${job.title} at ${job.company} in ${job.location}.`;

  const system = 'You are an expert professional CV writer with 15 years of experience writing CVs that pass ATS systems and impress hiring managers.';
  const prompt = `Write a tailored, professional CV for this candidate for the specific job below.

TARGET JOB: ${job.title} at ${job.company}
LOCATION: ${job.location || 'Not specified'}
SALARY: ${job.salary || 'Not specified'}

JOB DESCRIPTION:
${jobDesc}

CANDIDATE PROFILE:
${cvText}

Write a complete, tailored CV that:
- Opens with a punchy profile summary specifically written for this role
- Lists skills in order of relevance to THIS job
- Presents work experience with bullet points using strong action verbs
- Highlights transferable skills and achievements that match the job requirements
- Includes all relevant keywords from the job description naturally
- Is formatted for maximum ATS compatibility
- Includes contact information at the top

Format the CV with clear section headers (PROFILE, KEY SKILLS, WORK EXPERIENCE, EDUCATION, CERTIFICATIONS). Use clean formatting suitable for a Word document.`;

  return await callClaude(prompt, system, 3000);
}

async function generateCoverLetter(profile, job) {
  const jobDesc = job.description || `${job.title} at ${job.company}.`;
  const skills = Array.isArray(profile.skills) ? profile.skills.slice(0, 8).join(', ') : '';
  const topExp = Array.isArray(profile.experience) && profile.experience[0]
    ? `${profile.experience[0].title} at ${profile.experience[0].company}`
    : 'relevant experience';

  const system = 'You are an expert cover letter writer. Write compelling, personalised cover letters that get interviews.';
  const prompt = `Write a tailored, professional cover letter for this job application.

CANDIDATE: ${profile.name}
EMAIL: ${profile.email}
PHONE: ${profile.phone}
LOCATION: ${profile.location}

TARGET ROLE: ${job.title}
COMPANY: ${job.company}
JOB LOCATION: ${job.location || 'Not specified'}

JOB DESCRIPTION:
${jobDesc}

CANDIDATE'S TOP SKILLS: ${skills}
MOST RECENT ROLE: ${topExp}
PROFILE SUMMARY: ${profile.summary}
ADDITIONAL CONTEXT: ${profile.extra || 'N/A'}

Write a 3-4 paragraph cover letter that:
1. Opens with genuine enthusiasm for this specific role and company
2. Highlights 2-3 most relevant achievements and experiences from their background
3. Addresses key requirements from the job description with specific examples
4. Shows personality and fit while remaining professional
5. Ends with a clear, confident call to action
6. Is approximately 300-350 words

Include today's date (${new Date().toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'})}), full address block, and professional sign-off.`;

  return await callClaude(prompt, system, 1500);
}

module.exports = { scoreCV, suggestEdits, applyEdits, generateCV, generateCoverLetter, profileToCVText };
