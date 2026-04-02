/**
 * Indeed Job Scraper Service
 * Uses the `indeed-scraper` npm package.
 * Note: Web scraping may be subject to Indeed's Terms of Service.
 * Use responsibly and at a low request rate.
 */

let indeed;
try {
  indeed = require('indeed-scraper');
} catch (e) {
  indeed = null;
}

async function searchJobs(options = {}) {
  const {
    query = '',
    location = '',
    radius = '25',
    maxAge = '14',
    jobType = '',
    limit = 50
  } = options;

  if (!indeed) {
    console.warn('indeed-scraper not installed, returning mock data');
    return getMockResults(query, location);
  }

  const queryOptions = {
    host: 'www.indeed.co.uk',
    query,
    city: location || 'United Kingdom',
    radius: String(radius),
    maxAge: String(maxAge),
    sort: 'date',
    limit: parseInt(limit) || 50,
    excludeSponsored: false
  };

  if (jobType) queryOptions.jobType = jobType;

  try {
    const results = await indeed.query(queryOptions);
    return results.map(normalizeJob);
  } catch (err) {
    console.error('Scraper error:', err.message);
    // Fallback to mock data with error flag
    const mock = getMockResults(query, location);
    mock._scraperError = err.message;
    mock._isMock = true;
    return mock;
  }
}

function normalizeJob(job) {
  return {
    title: job.jobtitle || job.title || '',
    company: job.company || '',
    location: job.formattedLocation || job.location || '',
    salary: job.salary || job.formattedRelativeTime || '',
    summary: job.snippet || job.summary || '',
    url: job.url || (job.jobkey ? `https://www.indeed.co.uk/viewjob?jk=${job.jobkey}` : ''),
    postDate: job.date || job.postDate || '',
    isEasyApply: job.isEasyApply || false,
    source: 'Indeed'
  };
}

function getMockResults(query, location) {
  return [
    {
      title: `${query || 'Delivery Driver'} (Sample)`,
      company: 'Sample Company Ltd',
      location: location || 'Bridport, Dorset',
      salary: '£12.50/hr',
      summary: 'This is sample data shown because the Indeed scraper could not connect. Install dependencies and ensure network access to see live results.',
      url: '',
      postDate: 'Today',
      isEasyApply: false,
      source: 'Mock',
      _isMock: true
    },
    {
      title: `Senior ${query || 'Driver'}`,
      company: 'Another Company',
      location: location || 'Dorchester, Dorset',
      salary: '£14/hr',
      summary: 'Sample job listing — replace with real Indeed results by ensuring indeed-scraper is installed.',
      url: '',
      postDate: '2 days ago',
      isEasyApply: true,
      source: 'Mock',
      _isMock: true
    }
  ];
}

module.exports = { searchJobs };
