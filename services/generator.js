/**
 * Document Generator Service
 * Creates .docx CV and Cover Letter files using the `docx` library
 */

const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType, ShadingType } = require('docx');

const NAVY = '1F3864';
const TEAL = '0E7490';

function heading1(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28, color: NAVY, font: 'Calibri' })],
    spacing: { before: 300, after: 100 },
    border: { bottom: { color: TEAL, space: 1, style: BorderStyle.SINGLE, size: 6 } }
  });
}

function heading2(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 22, color: TEAL, font: 'Calibri' })],
    spacing: { before: 200, after: 60 }
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: 'Calibri', ...opts })],
    spacing: { before: 40, after: 40 }
  });
}

function bullet(text) {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: 'Calibri' })],
    bullet: { level: 0 },
    spacing: { before: 20, after: 20 }
  });
}

function spacer() {
  return new Paragraph({ children: [new TextRun('')], spacing: { before: 80, after: 80 } });
}

/**
 * Create a CV .docx from profile + AI-generated content
 */
async function createCVDoc(profile, cvGeneratedText) {
  const lines = cvGeneratedText.split('\n');
  const children = [];

  // Header with name and contact
  children.push(new Paragraph({
    children: [new TextRun({ text: profile.name || 'Your Name', bold: true, size: 36, color: NAVY, font: 'Calibri' })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 }
  }));

  const contact = [profile.email, profile.phone, profile.location].filter(Boolean).join('  |  ');
  if (contact) {
    children.push(new Paragraph({
      children: [new TextRun({ text: contact, size: 18, color: '64748b', font: 'Calibri' })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 40 }
    }));
  }

  if (profile.linkedin) {
    children.push(new Paragraph({
      children: [new TextRun({ text: profile.linkedin, size: 18, color: TEAL, font: 'Calibri' })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 }
    }));
  }

  // Parse and render the AI-generated content
  let inBullet = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inBullet) inBullet = false;
      children.push(spacer());
      continue;
    }

    // Detect section headers (ALL CAPS lines or lines ending with :)
    if (/^[A-Z][A-Z\s&\/]+[A-Z]$/.test(trimmed) || /^[A-Z][A-Z\s]+:$/.test(trimmed)) {
      children.push(heading1(trimmed.replace(/:$/, '')));
      inBullet = false;
      continue;
    }

    // Bullet points
    if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
      children.push(bullet(trimmed.replace(/^[•\-*]\s*/, '')));
      inBullet = true;
      continue;
    }

    // Bold lines (job titles / company names)
    if (trimmed.includes(' at ') && trimmed.length < 80) {
      children.push(new Paragraph({
        children: [new TextRun({ text: trimmed, bold: true, size: 20, font: 'Calibri' })],
        spacing: { before: 120, after: 20 }
      }));
      continue;
    }

    children.push(body(trimmed));
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } }
      },
      children
    }]
  });

  return Packer.toBuffer(doc);
}

/**
 * Create a Cover Letter .docx
 */
async function createLetterDoc(profile, job, letterText) {
  const lines = letterText.split('\n');
  const children = [];

  // Sender header
  children.push(new Paragraph({
    children: [new TextRun({ text: profile.name || '', bold: true, size: 24, color: NAVY, font: 'Calibri' })],
    spacing: { before: 0, after: 40 }
  }));

  const contactLine = [profile.email, profile.phone, profile.location].filter(Boolean).join('  |  ');
  if (contactLine) {
    children.push(body(contactLine, { color: '64748b', size: 18 }));
  }

  children.push(spacer());
  children.push(new Paragraph({
    children: [new TextRun({ text: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), size: 20, font: 'Calibri' })],
    spacing: { before: 80, after: 160 }
  }));

  // Render letter content
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      children.push(spacer());
      continue;
    }
    // Skip date lines already added
    if (/^\d{1,2}\s+\w+\s+\d{4}$/.test(trimmed)) continue;
    children.push(body(trimmed));
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 720, right: 900, bottom: 720, left: 900 } }
      },
      children
    }]
  });

  return Packer.toBuffer(doc);
}

module.exports = { createCVDoc, createLetterDoc };
