/**
 * pull.js — Pull all templates and CSS assets from Passport into local files.
 *
 * Run this once to bootstrap your repository from an existing Passport instance.
 * Safe to run again — it overwrites local files with the current Passport state.
 *
 * Behavior:
 *   - Items present in Passport but missing locally are written to the top-level
 *     directory (article-templates/, admin-templates/, assets/).
 *   - Items present locally but missing from Passport are moved into a sibling
 *     `_archived/` directory (kept for history; never re-uploaded by push.js).
 *   - Items present in `_archived/` are left untouched even if Passport still
 *     returns them — archival is an explicit user action.
 *   - The `metadata.admin_modified_at` field set by the Passport admin UI is
 *     stripped from local files. Affected slugs/filenames are written to
 *     `.sync-pending.json` so push.js --only-pending can clear the flag in
 *     Passport on the next round-trip.
 *
 * Usage:
 *   node src/pull.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getToken, getConfig, templateList, assetList, assetGet } from './api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(ROOT, 'article-templates');
const ADMIN_TEMPLATES_DIR = path.join(ROOT, 'admin-templates');
const ASSETS_DIR = path.join(ROOT, 'assets');
const PENDING_PATH = path.join(ROOT, '.sync-pending.json');
const ARCHIVED = '_archived';

const log = (...msg) => console.log('[pull]', ...msg);

const listSubdirs = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((entry) => entry !== ARCHIVED)
    .filter((entry) => fs.statSync(path.join(dir, entry)).isDirectory());
};

const archiveDir = (baseDir, slug) => {
  const from = path.join(baseDir, slug);
  const archiveRoot = path.join(baseDir, ARCHIVED);
  fs.mkdirSync(archiveRoot, { recursive: true });
  const to = path.join(archiveRoot, slug);
  if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
  fs.renameSync(from, to);
};

const archiveFile = (baseDir, filename) => {
  const from = path.join(baseDir, filename);
  const archiveRoot = path.join(baseDir, ARCHIVED);
  fs.mkdirSync(archiveRoot, { recursive: true });
  const to = path.join(archiveRoot, filename);
  if (fs.existsSync(to)) fs.rmSync(to, { force: true });
  fs.renameSync(from, to);
};

// ---------------------------------------------------------------------------
// Pull templates
// ---------------------------------------------------------------------------

const pullTemplates = async (apiHost, token, pending) => {
  log('Fetching templates from Passport...');
  const result = await templateList(apiHost, token);
  const templates = Array.isArray(result) ? result : result?.body || [];

  log(`Found ${templates.length} template(s) in Passport.\n`);
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  fs.mkdirSync(ADMIN_TEMPLATES_DIR, { recursive: true });

  const remoteByDirAndSlug = { [TEMPLATES_DIR]: new Set(), [ADMIN_TEMPLATES_DIR]: new Set() };

  for (const template of templates) {
    const slug = template.slug || template.name.toLowerCase().replace(/\s+/g, '-');
    const isAdmin = (template.type || '').toLowerCase() === 'admin';
    const baseDir = isAdmin ? ADMIN_TEMPLATES_DIR : TEMPLATES_DIR;
    remoteByDirAndSlug[baseDir].add(slug);

    // If the user archived this template locally, leave it alone — archival is
    // an explicit "stop syncing" signal even if Passport still has the item.
    const archivedPath = path.join(baseDir, ARCHIVED, slug);
    if (fs.existsSync(archivedPath)) {
      log(`  · ${path.relative(ROOT, baseDir)}/${ARCHIVED}/${slug}/ — skipped (archived locally)`);
      continue;
    }

    const dir = path.join(baseDir, slug);
    fs.mkdirSync(dir, { recursive: true });

    // Strip the outer DOCTYPE wrapper that handleSave() adds — store just the body content
    let body = template.body || '';
    const bodyMatch = body.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) {
      body = bodyMatch[1].trim();
    }

    fs.writeFileSync(path.join(dir, 'template.html'), body.trimEnd() + '\n', 'utf8');

    // The Passport admin UI sets admin_modified_at and admin_modified_by when
    // something is saved through the UI. We strip them locally and queue a
    // push-back to clear them server-side, otherwise they would round-trip on
    // every sync. The email is preserved in .sync-pending.json so the
    // sync-from-passport workflow can include it in the commit message.
    const hadAdminModified = template.metadata?.admin_modified_at != null;
    if (hadAdminModified) {
      pending.templates.push({
        slug,
        modified_by: template.metadata?.admin_modified_by || null,
      });
    }

    const channel = template.metadata?.type || template.channel || 'email';
    const meta = {
      name: template.name,
      slug,
      type: template.type || 'article',
      channel,
      title: template.title || '',
      metadata: {
        subject: template.metadata?.subject || '',
        from_address: template.metadata?.from_address || {},
        reply_to: template.metadata?.reply_to || {},
        tokenize_urls: template.metadata?.tokenize_urls || false,
        inactive: template.metadata?.inactive || false,
        audiences: template.metadata?.audiences || [],
      },
    };

    if (template.settings && Object.keys(template.settings).length > 0) {
      meta.settings = template.settings;
    }

    if (template.events && template.events.length > 0) {
      // Strip server-assigned IDs — the API regenerates them on every PUT,
      // so storing them causes spurious diffs on every push+pull cycle.
      meta.events = template.events.map(({ id: _id, ...rest }) => rest);
    }

    fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');

    const contextPath = path.join(dir, 'context.json');
    if (!fs.existsSync(contextPath)) {
      const defaultContext = {
        article: {
          title: 'Sample Article Title',
          summary: 'A short summary of the article used for preview.',
          uri: 'https://example.com/articles/sample',
          author: 'Jane Doe',
          published_at: new Date().toISOString(),
          image_uri: '',
        },
        preheader: 'A short summary of the article used for preview.',
      };
      fs.writeFileSync(contextPath, JSON.stringify(defaultContext, null, 2) + '\n', 'utf8');
    }

    const flagNote = hadAdminModified ? ' [admin_modified_at stripped]' : '';
    log(`  ✓ ${path.relative(ROOT, baseDir)}/${slug}/${flagNote}`);
  }

  // Archive any local top-level templates that Passport no longer has
  for (const baseDir of [TEMPLATES_DIR, ADMIN_TEMPLATES_DIR]) {
    const local = listSubdirs(baseDir);
    for (const slug of local) {
      if (!remoteByDirAndSlug[baseDir].has(slug)) {
        archiveDir(baseDir, slug);
        log(`  → archived ${path.relative(ROOT, baseDir)}/${slug}/ (no longer in Passport)`);
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Pull assets
// ---------------------------------------------------------------------------

const pullAssets = async (apiHost, token, pending) => {
  log('\nFetching CSS assets from Passport...');
  const result = await assetList(apiHost, token, 'text/css');
  const assets = Array.isArray(result) ? result : result?.body || [];

  log(`Found ${assets.length} CSS asset(s) in Passport.\n`);
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  const remoteFilenames = new Set();

  for (const asset of assets) {
    remoteFilenames.add(asset.filename);

    const archivedPath = path.join(ASSETS_DIR, ARCHIVED, asset.filename);
    if (fs.existsSync(archivedPath)) {
      log(`  · assets/${ARCHIVED}/${asset.filename} — skipped (archived locally)`);
      continue;
    }

    try {
      const full = await assetGet(apiHost, token, asset.id, true);
      if (!full?.payload) {
        log(`  ⚠ No content for asset "${asset.filename}" — skipping.`);
        continue;
      }
      const content = Buffer.from(full.payload, 'base64').toString('utf8');
      fs.writeFileSync(path.join(ASSETS_DIR, asset.filename), content, 'utf8');

      const hadAdminModified = asset.metadata?.admin_modified_at != null;
      if (hadAdminModified) {
        pending.assets.push({
          filename: asset.filename,
          modified_by: asset.metadata?.admin_modified_by || null,
        });
      }

      const flagNote = hadAdminModified ? ' [admin_modified_at stripped]' : '';
      log(`  ✓ assets/${asset.filename}${flagNote}`);
    } catch (err) {
      console.error(`[pull] ERROR fetching asset "${asset.filename}":`, err.message);
    }
  }

  if (!fs.existsSync(ASSETS_DIR)) return;
  const localAssets = fs
    .readdirSync(ASSETS_DIR)
    .filter((f) => f !== ARCHIVED)
    .filter((f) => fs.statSync(path.join(ASSETS_DIR, f)).isFile())
    .filter((f) => f.endsWith('.css'));

  for (const filename of localAssets) {
    if (!remoteFilenames.has(filename)) {
      archiveFile(ASSETS_DIR, filename);
      log(`  → archived assets/${filename} (no longer in Passport)`);
    }
  }
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  const { apiHost, instance } = getConfig();
  log(`API host: ${apiHost}\n`);

  const tokenData = await getToken(apiHost, instance);
  const token = tokenData.access_token;
  log('Authenticated.\n');

  const pending = { templates: [], assets: [] };

  await pullTemplates(apiHost, token, pending);
  await pullAssets(apiHost, token, pending);

  if (pending.templates.length > 0 || pending.assets.length > 0) {
    fs.writeFileSync(PENDING_PATH, JSON.stringify(pending, null, 2) + '\n', 'utf8');
    log(
      `\nWrote .sync-pending.json (${pending.templates.length} template(s), ` +
        `${pending.assets.length} asset(s) need admin_modified_at cleared in Passport).`
    );
  } else if (fs.existsSync(PENDING_PATH)) {
    fs.rmSync(PENDING_PATH);
  }

  log('\nPull complete.');
  log('Next step: review the files, then commit them to git.');
};

main().catch((err) => {
  console.error('[pull] Fatal error:', err.message);
  process.exit(1);
});
