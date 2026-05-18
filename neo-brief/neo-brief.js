#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const Anthropic = require('@anthropic-ai/sdk');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

// ── Model ─────────────────────────────────────────────────────────────────────
const MODEL = 'claude-sonnet-4-6';

// ── Prompts ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a fashion intelligence analyst for N.E.O, a minimalist Gen Z clothing brand with an editorial aesthetic based in the Netherlands.

Produce a sharp daily brief with exactly these 5 sections:

**TREND SIGNALS** — What's moving in minimalist/Gen Z fashion right now (silhouettes, fabrics, colours, styling cues)
**COMPETITOR DROPS** — Notable new arrivals or campaigns from brands like Our Legacy, Auralee, Lemaire, Toteme, Baserange, Commes des Garçons, A.P.C, Studio Nicholson, Arket
**CULTURAL PULSE** — Relevant cultural moments, aesthetics, or subcultures that could inform N.E.O direction
**GUANGZHOU / MANUFACTURING** — Any relevant news about Chinese manufacturing, fabric sourcing, or Alibaba/1688 supplier landscape
**ONE CREATIVE PROMPT** — A single actionable design or creative idea for N.E.O based on today's signals

Be direct, editorial, and opinionated. Write like a sharp fashion editor, not a consultant. Under 400 words total. No fluff.`;

const USER_PROMPT = `Search the web for today's fashion news and produce the N.E.O daily brief. Focus on minimalist, Gen Z, and editorial fashion. Check for recent drops from Our Legacy, Auralee, Lemaire, Toteme and similar brands. Include any Guangzhou or Chinese manufacturing news relevant to a small independent label.`;

// ── Brief generation ──────────────────────────────────────────────────────────

async function generateBrief() {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let messages = [{ role: 'user', content: USER_PROMPT }];
  let briefText = '';

  // Server-side web search may require multiple continuations if it hits
  // the server-side iteration limit (stop_reason: "pause_turn").
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages,
    });

    // Collect all text blocks from this response
    for (const block of response.content) {
      if (block.type === 'text') {
        briefText += block.text;
      }
    }

    if (response.stop_reason === 'end_turn') {
      break;
    }

    if (response.stop_reason === 'pause_turn') {
      // Server-side tool loop hit its iteration limit. Re-send with the
      // assistant turn appended — the API resumes the search automatically.
      messages = [
        { role: 'user', content: USER_PROMPT },
        { role: 'assistant', content: response.content },
      ];
      continue;
    }

    // Any other stop reason (stop_sequence, max_tokens, etc.) — bail out.
    log(`Unexpected stop_reason: ${response.stop_reason}`);
    break;
  }

  const trimmed = briefText.trim();
  if (!trimmed) throw new Error('No brief content was generated');
  return trimmed;
}

// ── Email formatting ──────────────────────────────────────────────────────────

function formatDate() {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam',
  });
}

function parseSections(text) {
  // Split on **SECTION LABEL** markers, capturing the label.
  // Example: "**TREND SIGNALS** — content..." → label="TREND SIGNALS", content="content..."
  const parts = text.split(/\*\*([^*\n]+)\*\*/);
  // parts = [text_before, label1, content1, label2, content2, ...]

  if (parts.length < 3) return null; // No sections found

  const sections = [];
  for (let i = 1; i < parts.length; i += 2) {
    const label = parts[i].split(' — ')[0].trim();
    const raw = (parts[i + 1] || '').replace(/^ — /, '').trim();
    sections.push({ label, content: raw });
  }
  return sections;
}

function contentToHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

function buildHtmlEmail(briefText, date) {
  const sections = parseSections(briefText);

  let bodyHtml;
  if (sections && sections.length > 0) {
    bodyHtml = sections
      .map(({ label, content }, idx) => {
        return `${idx > 0 ? '<hr class="divider">' : ''}
    <div class="section">
      <div class="section-label">${label}</div>
      <div class="section-content"><p>${contentToHtml(content)}</p></div>
    </div>`;
      })
      .join('\n');
  } else {
    // Fallback: render as plain preformatted text if parsing fails
    bodyHtml = `<div class="raw">${contentToHtml(briefText)}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>N.E.O Brief — ${date}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      background: #ffffff;
      color: #111111;
      padding: 48px 32px;
      max-width: 620px;
      margin: 0 auto;
      font-size: 15px;
      line-height: 1.75;
    }
    .brand {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      letter-spacing: 8px;
      text-transform: uppercase;
      color: #000000;
      margin-bottom: 6px;
    }
    .date {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #888888;
      margin-bottom: 28px;
    }
    .header-rule {
      border: none;
      border-top: 2px solid #000000;
      margin-bottom: 32px;
    }
    .section { margin-bottom: 0; }
    .section-label {
      font-family: 'Courier New', Courier, monospace;
      font-size: 8px;
      letter-spacing: 3.5px;
      text-transform: uppercase;
      color: #000000;
      font-weight: bold;
      margin-bottom: 12px;
    }
    .section-content {
      font-size: 14px;
      line-height: 1.8;
      color: #111111;
    }
    .section-content p { margin-bottom: 10px; }
    .section-content p:last-child { margin-bottom: 0; }
    .divider {
      border: none;
      border-top: 1px solid #dddddd;
      margin: 28px 0;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #000000;
      font-family: 'Courier New', Courier, monospace;
      font-size: 8px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #aaaaaa;
    }
    .raw {
      font-size: 14px;
      line-height: 1.8;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div class="brand">N . E . O</div>
  <div class="date">${date}</div>
  <hr class="header-rule">
  ${bodyHtml}
  <div class="footer">N.E.O Intelligence — Not Even Ordinary</div>
</body>
</html>`;
}

// ── Email transport ───────────────────────────────────────────────────────────

function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: process.env.GMAIL_USER,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
    },
  });
}

async function sendEmail(briefText, date) {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `N.E.O Intelligence <${process.env.GMAIL_USER}>`,
    to: process.env.GMAIL_USER,
    subject: `N.E.O Brief — ${date}`,
    html: buildHtmlEmail(briefText, date),
    text: briefText,
  });
}

// ── Runner ────────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function run() {
  log('Generating N.E.O brief...');

  try {
    const brief = await generateBrief();
    log(`Brief ready (${brief.length} chars). Sending email...`);

    const date = formatDate();
    await sendEmail(brief, date);
    log(`Brief sent: ${date}`);
  } catch (err) {
    // Log and swallow — don't crash the cron process
    log(`ERROR: ${err.message}`);
    if (err.cause) log(`Caused by: ${err.cause}`);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

function validateEnv() {
  const required = [
    'ANTHROPIC_API_KEY',
    'GMAIL_USER',
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
    'GMAIL_REFRESH_TOKEN',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing environment variables: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in all values.');
    process.exit(1);
  }
}

validateEnv();

if (process.argv.includes('--now')) {
  // Manual trigger
  run();
} else {
  // Scheduled: Mon–Fri at 07:30 Amsterdam time
  cron.schedule('30 7 * * 1-5', run, { timezone: 'Europe/Amsterdam' });
  log('Scheduler started. Runs Mon–Fri at 07:30 Europe/Amsterdam.');
  log('Trigger manually anytime: node neo-brief.js --now');
}
