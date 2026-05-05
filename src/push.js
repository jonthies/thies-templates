/**
 * push.js — Push local templates and CSS assets to Passport.
 *
 * Usage:
 *   node src/push.js                        Push all templates and assets
 *   node src/push.js --slug welcome-email   Push only one template
 *   node src/push.js --only-pending         Push only the items listed in
 *                                            .sync-pending.json (written by
 *                                            pull.js to clear admin_modified_at).
 *                                            The file is deleted on success.
 *   node src/push.js --dry-run              Preview what would change (no writes)
 *
 * Items under any `_archived/` directory are never pushed.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import {
  getToken,
  getConfig,
  templateList,
  templateCreate,
  templateUpdate,
  assetList,
  assetCreate,
  assetUpdate,
} from './api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(ROOT, 'article-templates');
const ADMIN_TEMPLATES_DIR = path.join(ROOT, 'admin-templates');
const ASSETS_DIR = path.join(ROOT, 'assets');
const PENDING_PATH = path.join(ROOT, '.sync-pending.json');
const ARCHIVED = '_archived';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY_PENDING = args.includes('--only-pending');
const slugIndex = args.indexOf('--slug');
const ONLY_SLUG = slugIndex !== -1 ? args[slugIndex + 1] : null;

// When ONLY_PENDING is set, restrict pushes to the templates/assets named in
// .sync-pending.json. When ONLY_SLUG is set, restrict to that one template and
// skip assets entirely. Otherwise both filters are null and everything is pushed.
let ONLY_TEMPLATE_SLUGS = null;
let ONLY_ASSET_FILENAMES = null;

if (ONLY_PENDING) {
  if (!fs.existsSync(PENDING_PATH)) {
    console.log('[push] No .sync-pending.json found — nothing to push.');
    process.exit(0);
  }
  const pending = JSON.parse(fs.readFileSync(PENDING_PATH, 'utf8'));
  // Entries may be plain strings (older format) or { slug | filename, modified_by }
  // objects (current format that carries admin_modified_by for commit messages).
  const slugOf = (entry) => (typeof entry === 'string' ? entry : entry.slug);
  const filenameOf = (entry) => (typeof entry === 'string' ? entry : entry.filename);
  ONLY_TEMPLATE_SLUGS = new Set((pending.templates || []).map(slugOf));
  ONLY_ASSET_FILENAMES = new Set((pending.assets || []).map(filenameOf));
} else if (ONLY_SLUG) {
  ONLY_TEMPLATE_SLUGS = new Set([ONLY_SLUG]);
  ONLY_ASSET_FILENAMES = new Set();
}

const CI = !!(process.env.CI || process.env.GITHUB_ACTIONS);

const log = (...msg) => console.log('[push]', ...msg);
const logDry = (...msg) => console.log('[push:dry-run]', ...msg);

const confirm = (question) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim().toLowerCase() === 'y');
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read a template directory and build the API-ready template object.
 * Matches the shape produced by handleSave() in TemplateForm.jsx.
 */
const readTemplateDir = (baseDir, slug) => {
  const dir = path.join(baseDir, slug);
  const htmlPath = path.join(dir, 'template.html');
  const metaPath = path.join(dir, 'metadata.json');

  if (!fs.existsSync(htmlPath)) throw new Error(`Missing template.html in ${path.relative(ROOT, baseDir)}/${slug}/`);
  if (!fs.existsSync(metaPath)) throw new Error(`Missing metadata.json in ${path.relative(ROOT, baseDir)}/${slug}/`);

  const body = fs.readFileSync(htmlPath, 'utf8');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

  const channel = meta.channel || 'email';
  const isSMS = channel === 'sms';

  return {
    name: meta.name || slug,
    slug: meta.slug || slug,
    type: meta.type || 'article',
    title: meta.title || '',
    body: isSMS ? body : `<!DOCTYPE html><html><body>${body}</body></html>`,
    metadata: {
      type: channel,
      subject: meta.metadata?.subject || '',
      from_address: meta.metadata?.from_address || {},
      reply_to: meta.metadata?.reply_to || {},
      tokenize_urls: meta.metadata?.tokenize_urls || false,
      inactive: meta.metadata?.inactive || false,
      audiences: meta.metadata?.audiences || [],
    },
    settings: meta.settings || {},
    events: meta.events || [],
  };
};

// ---------------------------------------------------------------------------
// Push templates
// ---------------------------------------------------------------------------

/**
 * Collect all { baseDir, slug } entries from templates/ and admin-templates/,
 * excluding anything under `_archived/` and applying the ONLY_TEMPLATE_SLUGS
 * filter when set.
 */
const collectTemplateSlugs = () => {
  const entries = [];
  for (const baseDir of [TEMPLATES_DIR, ADMIN_TEMPLATES_DIR]) {
    if (!fs.existsSync(baseDir)) continue;
    const slugs = fs
      .readdirSync(baseDir)
      .filter((entry) => entry !== ARCHIVED)
      .filter((entry) => fs.statSync(path.join(baseDir, entry)).isDirectory())
      .filter((slug) => !ONLY_TEMPLATE_SLUGS || ONLY_TEMPLATE_SLUGS.has(slug));
    for (const slug of slugs) {
      entries.push({ baseDir, slug });
    }
  }
  return entries;
};

const pushTemplates = async (apiHost, token) => {
  const entries = collectTemplateSlugs();

  if (entries.length === 0) {
    if (ONLY_PENDING) log('No pending templates to push.');
    else if (ONLY_SLUG) log(`No template found with slug "${ONLY_SLUG}".`);
    else log('No template directories found.');
    return;
  }

  // Fetch existing templates once and index by slug for fast lookup
  log('Fetching existing templates from Passport...');
  const existing = await templateList(apiHost, token);
  const existingBySlug = {};
  (Array.isArray(existing) ? existing : existing?.body || []).forEach((t) => {
    existingBySlug[t.slug] = t;
  });

  for (const { baseDir, slug } of entries) {
    try {
      const template = readTemplateDir(baseDir, slug);
      const remote = existingBySlug[slug];

      if (template.metadata?.inactive) {
        log(`  ⚠ "${slug}" is marked inactive — it will be updated in Passport but remains disabled.`);
      }

      if (DRY_RUN) {
        if (remote) {
          logDry(`UPDATE templates/${slug} (id: ${remote.id})`);
        } else {
          logDry(`CREATE templates/${slug}`);
        }
        continue;
      }

      if (remote) {
        log(`Updating "${slug}"...`);
        await templateUpdate(apiHost, token, remote.id, template);
        log(`  ✓ Updated (id: ${remote.id})`);
      } else {
        log(`Creating "${slug}"...`);
        const created = await templateCreate(apiHost, token, template);
        log(`  ✓ Created (id: ${created.id})`);
      }
    } catch (err) {
      console.error(`[push] ERROR processing template "${slug}":`, err.message);
      process.exitCode = 1;
    }
  }
};

// ---------------------------------------------------------------------------
// Push CSS assets
// ---------------------------------------------------------------------------

const pushAssets = async (apiHost, token) => {
  if (!fs.existsSync(ASSETS_DIR)) {
    log('No assets/ directory found — skipping assets.');
    return;
  }

  const cssFiles = fs
    .readdirSync(ASSETS_DIR)
    .filter((f) => f !== ARCHIVED)
    .filter((f) => fs.statSync(path.join(ASSETS_DIR, f)).isFile())
    .filter((f) => f.endsWith('.css'))
    .filter((f) => !ONLY_ASSET_FILENAMES || ONLY_ASSET_FILENAMES.has(f));

  if (cssFiles.length === 0) {
    if (ONLY_PENDING) log('No pending assets to push.');
    else log('No .css files found in assets/');
    return;
  }

  // Fetch existing CSS assets once
  log('Fetching existing CSS assets from Passport...');
  const existing = await assetList(apiHost, token, 'text/css');
  const existingByFilename = {};
  (Array.isArray(existing) ? existing : existing?.body || []).forEach((a) => {
    existingByFilename[a.filename] = a;
  });

  for (const filename of cssFiles) {
    try {
      const content = fs.readFileSync(path.join(ASSETS_DIR, filename), 'utf8');
      const remote = existingByFilename[filename];

      if (DRY_RUN) {
        if (remote) {
          logDry(`UPDATE assets/${filename} (id: ${remote.id})`);
        } else {
          logDry(`CREATE assets/${filename}`);
        }
        continue;
      }

      if (remote) {
        log(`Updating asset "${filename}"...`);
        await assetUpdate(apiHost, token, remote.id, filename, content);
        log(`  ✓ Updated`);
      } else {
        log(`Creating asset "${filename}"...`);
        const created = await assetCreate(apiHost, token, filename, content);
        log(`  ✓ Created (id: ${created.id})`);
      }
    } catch (err) {
      console.error(`[push] ERROR processing asset "${filename}":`, err.message);
      process.exitCode = 1;
    }
  }
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  if (!CI && !DRY_RUN && !ONLY_PENDING) {
    console.warn('\n⚠  WARNING: You are pushing directly to Passport from the CLI.');
    console.warn('   The recommended workflow is: commit and push to git — GitHub Actions');
    console.warn('   will sync to Passport automatically, keeping the repo in sync.\n');
    const ok = await confirm('Are you sure you want to push directly? (y/N) ');
    if (!ok) {
      log('Aborted.');
      process.exit(0);
    }
    console.log();
  }

  if (DRY_RUN) log('Dry-run mode — no changes will be made.\n');
  if (ONLY_PENDING) {
    log(
      `Pending mode — pushing ${ONLY_TEMPLATE_SLUGS.size} template(s) and ` +
        `${ONLY_ASSET_FILENAMES.size} asset(s) from .sync-pending.json.\n`
    );
  }

  const { apiHost, instance } = getConfig();
  log(`API host: ${apiHost}`);

  const tokenData = await getToken(apiHost, instance);
  const token = tokenData.access_token;
  log('Authenticated.\n');

  await pushTemplates(apiHost, token);
  await pushAssets(apiHost, token);

  if (DRY_RUN) {
    log('\nDry-run complete.');
  } else {
    log('\nPush complete.');
    if (ONLY_PENDING && !process.exitCode) {
      fs.rmSync(PENDING_PATH);
      log('Removed .sync-pending.json.');
    }
  }
};

main().catch((err) => {
  console.error('[push] Fatal error:', err.message);
  process.exit(1);
});
