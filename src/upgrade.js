/**
 * upgrade.js — Pull framework updates from the upstream template repo.
 *
 * Adds the template repo as a git remote, fetches the latest, and checks out
 * the framework files (src/, .github/workflows/, package.json) from upstream.
 * User content (article-templates/, admin-templates/, assets/, .env) is never touched.
 *
 * Usage:
 *   npm run upgrade
 *   npm run upgrade -- --dry-run   # show what would change without writing
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const UPSTREAM_REMOTE = 'template-upstream';
const UPSTREAM_REPO = 'https://github.com/passport-online/template_agent.git';
const UPSTREAM_BRANCH = 'main';

const log = (...msg) => console.log('[upgrade]', ...msg);

// Framework files/dirs to pull from upstream.
// Directories use a trailing / and check out everything beneath them.
const FRAMEWORK_PATHS = [
  'src/',
  '.claude/skills/',
  '.github/workflows/sync.yml',
  '.github/workflows/sync-from-passport.yml',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const git = (args, opts = {}) => {
  const result = execSync(`git ${args}`, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: opts.stdio || 'pipe',
    ...opts,
  });
  return result ? result.trim() : '';
};

const ensureRemote = () => {
  let remotes;
  try {
    remotes = git('remote');
  } catch {
    throw new Error('Not inside a git repository.');
  }

  if (remotes.split('\n').includes(UPSTREAM_REMOTE)) {
    // Make sure the URL is current
    const currentUrl = git(`remote get-url ${UPSTREAM_REMOTE}`);
    if (currentUrl !== UPSTREAM_REPO) {
      log(`Updating remote "${UPSTREAM_REMOTE}" URL → ${UPSTREAM_REPO}`);
      git(`remote set-url ${UPSTREAM_REMOTE} ${UPSTREAM_REPO}`);
    }
  } else {
    log(`Adding remote "${UPSTREAM_REMOTE}" → ${UPSTREAM_REPO}`);
    git(`remote add ${UPSTREAM_REMOTE} ${UPSTREAM_REPO}`);
  }
};

const fetchUpstream = () => {
  log(`Fetching ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}...`);
  git(`fetch ${UPSTREAM_REMOTE} ${UPSTREAM_BRANCH}`, { stdio: 'inherit' });
};

// ---------------------------------------------------------------------------
// package.json merge — keep user-added deps, update framework deps
// ---------------------------------------------------------------------------

const mergePackageJson = (dryRun) => {
  const ref = `${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}`;
  let upstreamRaw;
  try {
    upstreamRaw = git(`show ${ref}:package.json`);
  } catch {
    log('  ⚠ No package.json in upstream — skipping merge.');
    return;
  }

  const localPath = path.join(ROOT, 'package.json');
  const localRaw = fs.readFileSync(localPath, 'utf8');
  const local = JSON.parse(localRaw);
  const upstream = JSON.parse(upstreamRaw);

  // Overwrite scripts and top-level metadata from upstream
  const merged = { ...local };
  for (const key of ['name', 'description', 'type', 'scripts', 'keywords', 'license']) {
    if (upstream[key] !== undefined) {
      merged[key] = upstream[key];
    }
  }

  // Merge dependencies: upstream wins on shared keys, user additions are kept
  for (const depKey of ['dependencies', 'devDependencies']) {
    if (upstream[depKey]) {
      merged[depKey] = { ...(local[depKey] || {}), ...upstream[depKey] };
    }
  }

  const mergedRaw = JSON.stringify(merged, null, 2) + '\n';
  if (mergedRaw === localRaw) {
    log('  – package.json (no changes)');
    return;
  }

  if (dryRun) {
    log('  ~ package.json (would update)');
  } else {
    fs.writeFileSync(localPath, mergedRaw, 'utf8');
    log('  ✓ package.json (merged)');
  }
};

// ---------------------------------------------------------------------------
// Confirmation prompt
// ---------------------------------------------------------------------------

const confirm = (question) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
};

// ---------------------------------------------------------------------------
// Diff summary — returns { changed, added, unchanged } arrays of paths
// ---------------------------------------------------------------------------

const summarizeChanges = (ref) => {
  const changed = [];
  const added = [];
  const unchanged = [];

  for (const p of FRAMEWORK_PATHS) {
    try {
      const diff = git(`diff HEAD ${ref} -- ${p}`);
      if (diff) {
        changed.push(p);
      } else {
        unchanged.push(p);
      }
    } catch {
      added.push(p);
    }
  }

  // Check package.json separately
  try {
    const upstreamRaw = git(`show ${ref}:package.json`);
    const localRaw = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
    const local = JSON.parse(localRaw);
    const upstream = JSON.parse(upstreamRaw);
    const merged = { ...local };
    for (const key of ['name', 'description', 'type', 'scripts', 'keywords', 'license']) {
      if (upstream[key] !== undefined) merged[key] = upstream[key];
    }
    for (const depKey of ['dependencies', 'devDependencies']) {
      if (upstream[depKey]) merged[depKey] = { ...(local[depKey] || {}), ...upstream[depKey] };
    }
    const mergedRaw = JSON.stringify(merged, null, 2) + '\n';
    if (mergedRaw !== localRaw) {
      changed.push('package.json');
    } else {
      unchanged.push('package.json');
    }
  } catch {
    unchanged.push('package.json');
  }

  return { changed, added, unchanged };
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  const dryRun = process.argv.includes('--dry-run');
  const skipConfirm = process.argv.includes('--yes') || process.argv.includes('-y');

  ensureRemote();
  fetchUpstream();

  const ref = `${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}`;

  // Show summary
  log(`\nComparing local files against ${ref}...\n`);
  const { changed, added, unchanged } = summarizeChanges(ref);

  for (const p of unchanged) log(`  – ${p} (no changes)`);
  for (const p of changed)   log(`  ~ ${p} (will be updated)`);
  for (const p of added)     log(`  + ${p} (new from upstream)`);

  if (changed.length === 0 && added.length === 0) {
    log('\nAlready up to date — nothing to do.');
    return;
  }

  log('');

  if (dryRun) {
    log('Dry-run complete. Run without --dry-run to apply changes.');
    return;
  }

  // Confirm before applying
  if (!skipConfirm) {
    const yes = await confirm('[upgrade] Apply these changes? (y/N) ');
    if (!yes) {
      log('Upgrade cancelled.');
      return;
    }
    log('');
  }

  // Apply changes
  for (const p of [...changed, ...added]) {
    if (p === 'package.json') continue; // handled separately below
    try {
      git(`checkout ${ref} -- ${p}`);
      log(`  ✓ ${p}`);
    } catch (err) {
      log(`  ⚠ ${p} — ${err.message}`);
    }
  }

  if (changed.includes('package.json') || added.includes('package.json')) {
    mergePackageJson(false);
  }

  log('\nUpgrade complete.');
  log('Review the changes with: git diff');
  log('Then commit: git add -A && git commit -m "Upgrade framework from upstream"');

  // Remind to reinstall if package.json changed
  try {
    const diff = git('diff --name-only -- package.json');
    if (diff) {
      log('\n⚠ package.json was updated — run "npm install" to update dependencies.');
    }
  } catch { /* ignore */ }
};

main().catch((err) => {
  console.error('[upgrade] Fatal error:', err.message);
  process.exit(1);
});
