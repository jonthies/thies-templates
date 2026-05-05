/**
 * preview.js — Render a template with context and save the HTML output locally.
 *
 * Always uses the local template.html body, inlining local CSS assets and sending
 * to POST /templates/render. Works whether or not the template has been pushed.
 *
 * Usage:
 *   node src/preview.js --slug welcome-email
 *   node src/preview.js --slug welcome-email --open
 *   node src/preview.js --slug welcome-email --context path/to/context.json
 *   node src/preview.js --slug welcome-email --article-id <id>
 *   node src/preview.js --slug welcome-email --user-id <id>
 *   node src/preview.js --slug welcome-email --channel rss
 *   node src/preview.js --slug welcome-email --send-to you@example.com
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getToken, getConfig, templatePreview, emailSend } from './api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(ROOT, 'article-templates');
const ADMIN_TEMPLATES_DIR = path.join(ROOT, 'admin-templates');
const ASSETS_DIR = path.join(ROOT, 'assets');
const OUTPUT_DIR = path.join(ROOT, 'preview-output');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const SLUG = getArg('--slug');
const OPEN = args.includes('--open');
const CUSTOM_CONTEXT = getArg('--context');
const CHANNEL_OVERRIDE = getArg('--channel');
const ARTICLE_ID = getArg('--article-id');
const USER_ID = getArg('--user-id');
const SEND_TO = getArg('--send-to');
const FROM = getArg('--from');

const log = (...msg) => console.log('[preview]', ...msg);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the base directory containing the given slug, checking templates/ first
 * then admin-templates/. Returns null if not found in either.
 */
const findTemplateBaseDir = (slug) => {
  for (const baseDir of [TEMPLATES_DIR, ADMIN_TEMPLATES_DIR]) {
    if (fs.existsSync(path.join(baseDir, slug))) return baseDir;
  }
  return null;
};

const loadContext = (baseDir, slug) => {
  if (CUSTOM_CONTEXT) {
    const p = path.resolve(CUSTOM_CONTEXT);
    if (!fs.existsSync(p)) throw new Error(`Context file not found: ${p}`);
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }

  const defaultPath = path.join(baseDir, slug, 'context.json');
  if (fs.existsSync(defaultPath)) {
    return JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
  }

  log('No context.json found — using empty context.');
  return {};
};

const loadBody = (baseDir, slug) => {
  const p = path.join(baseDir, slug, 'template.html');
  if (!fs.existsSync(p)) throw new Error(`template.html not found in ${path.relative(ROOT, baseDir)}/${slug}/`);
  return fs.readFileSync(p, 'utf8');
};

const loadMetadata = (baseDir, slug) => {
  const p = path.join(baseDir, slug, 'metadata.json');
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};

/**
 * Replace {{ assetBody "file.css" }} helpers with the contents of the local
 * assets/ file so the templatePreview endpoint receives fully-expanded CSS.
 */
const inlineLocalAssets = (body) => {
  return body.replace(/{{\s*assetBody\s+"([^"]+)"\s*}}/g, (match, filename) => {
    const assetPath = path.join(ASSETS_DIR, filename);
    if (!fs.existsSync(assetPath)) {
      log(`Warning: asset "${filename}" not found in assets/ — leaving placeholder.`);
      return match;
    }
    return fs.readFileSync(assetPath, 'utf8');
  });
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  if (!SLUG) {
    console.error('[preview] Error: --slug is required.\n');
    console.error('  Usage: node src/preview.js --slug <template-slug> [--open] [--context <file>]');
    process.exit(1);
  }

  const baseDir = findTemplateBaseDir(SLUG);
  if (!baseDir) {
    console.error(`[preview] Error: "${SLUG}" not found in article-templates/ or admin-templates/.`);
    console.error('  Run "npm run pull" first or check the slug spelling.');
    process.exit(1);
  }

  const { apiHost, instance } = getConfig();
  log(`API host: ${apiHost}`);

  const tokenData = await getToken(apiHost, instance);
  const token = tokenData.access_token;
  log('Authenticated.');

  const meta = loadMetadata(baseDir, SLUG);
  if (meta.metadata?.inactive) {
    log(`⚠ Warning: "${SLUG}" is marked inactive — this template is disabled in Passport.`);
  }
  const channel = CHANNEL_OVERRIDE || meta.channel || 'email';
  const body = loadBody(baseDir, SLUG);

  const transmute = channel === 'email' || channel === undefined;
  const isSMS = channel === 'sms';

  // Inline local assets before sending to the render endpoint
  const expandedBody = inlineLocalAssets(body);
  const wrappedBody = isSMS ? expandedBody : `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta charset="utf-8" />
    <style>
      html {
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      body {
        height: 95% !important;
      }
    </style>
  </head>
  <body>
    ${expandedBody}
  </body>
</html>`;

  if (ARTICLE_ID) {
    log(`Rendering with local body + article_id: ${ARTICLE_ID}`);
  } else {
    log('Rendering with local body...');
  }

  const render = {
    body: wrappedBody,
    channel,
    inline: true,
    transmute,
    debug_edge_processing: true,
    timeout: '30s',
    ...(USER_ID ? { user_id: USER_ID } : {}),
    ...(ARTICLE_ID ? { article_id: ARTICLE_ID } : { context: loadContext(baseDir, SLUG) }),
  };
  const html = await templatePreview(apiHost, token, render);

  // Write output
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputFile = path.join(OUTPUT_DIR, `${SLUG}.html`);
  fs.writeFileSync(outputFile, html, 'utf8');
  log(`Output saved to: preview-output/${SLUG}.html`);

  if (SEND_TO) {
    const subject = `Preview: ${meta.name || SLUG}`;
    const rawFrom = FROM ? { address: FROM, name: FROM } : meta.metadata?.from_address;
    const from = rawFrom && typeof rawFrom === 'object' && Object.keys(rawFrom).length > 0 ? rawFrom : undefined;
    const rawReplyTo = meta.metadata?.reply_to;
    const reply_to = rawReplyTo && Object.keys(rawReplyTo).length > 0 ? rawReplyTo : undefined;
    log(`Sending to ${SEND_TO} with subject "${subject}"...`);
    await emailSend(apiHost, token, { to: SEND_TO, subject, html, from, reply_to });
    log(`Email sent to ${SEND_TO}.`);
  }

  if (OPEN) {
    const { default: open } = await import('open');
    await open(outputFile);
    log('Opened in browser.');
  } else if (!SEND_TO) {
    log('Tip: pass --open to open in your browser, or --send-to <email> to send a test email.');
  }
};

main().catch((err) => {
  console.error('[preview] Fatal error:', err.message);
  process.exit(1);
});
