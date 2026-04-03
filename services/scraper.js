/**
 * Indeed Job Search — uses the Indeed RSS feed (reliable, no API key needed)
 * Falls back to the indeed-scraper npm package, then mock data.
 */

const https = require('https');
const http = require('http');

// ── RSS feed fetch ─────────────────────────────────────────────────────────

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JobTracker/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      },
      timeout: 10000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&[a-z]+;/gi, '');
}

function stripHtml(str) {
  return decodeHtmlEntities(str.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'))
        || block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? m[1].trim() : '';
    };

    const title = stripHtml(get('title'));
    const link  = get('link') || get('guid');
    const desc  = stripHtml(get('description'));
    const pubDate = get('pubDate');

    // Indeed puts company/location in source and custom tags
    const companyMatch = block.match(/<source[^>]*>([^<]+)<\/source>/i)
      || desc.match(/^([^-–]+?)(?:\s[-–]\s|\s*at\s)/i);
    const company = companyMatch ? stripHtml(companyMatch[1]) : '';

    // Location often appears as "title - company - location" in the title
    const titleParts = title.split(/\s[-–]\s/);
    const cleanTitle = titleParts[0] || title;
    const location = titleParts[2] || '';

    // Salary extraction from description
    const salaryMatch = desc.match(/£[\d,]+(?:\s*[-–]\s*£[\d,]+)?(?:\s*(?:per|\/)\s*(?:hour|hr|annum|year|day))?/i)
      || desc.match(/[\d,]+(?:\s*[-–]\s*[\d,]+)?\s*(?:per|\/)\s*(?:hour|hr|annum|year)/i);
    const salary = salaryMatch ? salaryMatch[0] : '';

    if (cleanTitle && link) {
      items.push({
        title: cleanTitle,
        company: company || titleParts[1] || '',
        location,
        salary,
        summary: desc.substring(0, 300),
        url: link,
        postDate: pubDate ? new Date(pubDate).toLocaleDateString('en-GB') : '',
        isEasyApply: false,
        source: 'Indeed'
      });
    }
  }

  return items;
}

async function searchViaRSS(query, location, radius, maxAge) {
  const params = new URLSearchParams({
    q: query,
    l: location || 'United Kingdom',
    radius: String(radius || 25),
    fromage: String(maxAge || 14),
    sort: 'date',
    limit: '50'
  });

  const url = `https://www.indeed.co.uk/rss?${params}`;
  const { status, body } = await fetchUrl(url);

  if (status !== 200) throw new Error(`RSS returned HTTP ${status}`);
  if (!body.includes('<item>')) throw new Error('No jobs found in RSS feed');

  return parseRSS(body);
}

// ── indeed-scraper npm package fallback ────────────────────────────────────

let indeedPkg;
try { indeedPkg = require('indeed-scraper'); } catch { indeedPkg = null; }

async function searchViaPkg(query, location, radius, jobType, maxAge) {
  if (!indeedPkg) throw new Error('indeed-scraper not available');
  const results = await indeedPkg.query(
    query,
    location || 'United Kingdom',
    String(radius || 25),
    jobType || '',
    String(maxAge || 14)
  );
  return results.map(j => ({
    title: j.jobtitle || j.title || '',
    company: j.company || '',
    location: j.formattedLocation || j.location || '',
    salary: j.salary || '',
    summary: j.snippet || j.summary || '',
    url: j.url || (j.jobkey ? `https://www.indeed.co.uk/viewjob?jk=${j.jobkey}` : ''),
    postDate: j.date || '',
    isEasyApply: j.isEasyApply || false,
    source: 'Indeed'
  }));
}

// ── Main export ────────────────────────────────────────────────────────────

async function searchJobs(options = {}) {
  const {
    query = '',
    location = '',
    radius = 25,
    maxAge = 14,
    jobType = '',
    limit = 50
  } = options;

  if (!query) return [];

  // 1. Try RSS feed first (most reliable)
  try {
    const results = await searchViaRSS(query, location, radius, maxAge);
    return results.slice(0, parseInt(limit) || 50);
  } catch (rssErr) {
    console.warn('RSS feed failed:', rssErr.message);
  }

  // 2. Fallback to indeed-scraper package
  try {
    const results = await searchViaPkg(query, location, radius, jobType, maxAge);
    return results.slice(0, parseInt(limit) || 50);
  } catch (pkgErr) {
    console.warn('indeed-scraper pkg failed:', pkgErr.message);
  }

  // 3. Last resort: mock data with clear flag
  return getMockResults(query, location);
}

function getMockResults(query, location) {
  return [
    {
      title: `${query} (Sample — live search unavailable)`,
      company: 'Sample Company Ltd',
      location: location || 'United Kingdom',
      salary: '',
      summary: 'Live job results could not be fetched. Add your job manually using the + button, or try searching again.',
      url: '',
      postDate: 'Today',
      isEasyApply: false,
      source: 'Mock',
      _isMock: true
    }
  ];
}

module.exports = { searchJobs };
