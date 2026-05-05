# Passport Template Agent

This is a GitOps framework for managing [Passport](https://passport.online) email templates and CSS assets via a git repository. Each team creates their own copy of this repo for their Passport installation.

## How deployment works

There are two GitHub Actions workflows that keep the repo and Passport in sync:

```
local edit → commit → git push origin main → sync.yml          → Passport updated
                                              (push-to-Passport)

daily cron → sync-from-passport.yml ─┬─→ pull from Passport
                                     ├─→ if admin_modified_at was set anywhere,
                                     │   push cleaned state back (--only-pending)
                                     └─→ commit + push to main
```

- `sync.yml` triggers on pushes to `main` touching `article-templates/`, `admin-templates/`, or `assets/`. Runs `node src/push.js`. **Committing and pushing is the normal way to deploy — not running push manually.**
- `sync-from-passport.yml` runs daily (06:00 UTC) and via `workflow_dispatch`. Captures changes made through the Passport admin UI back into git.
- Both workflows share the `passport-sync` concurrency group, so they never run simultaneously.

## Project structure

```
article-templates/{slug}/   ← regular templates (type: article)
  template.html           ← template body (Passport/Go template syntax)
  metadata.json           ← name, channel, subject, from address, etc.
  context.json            ← sample data for npm run preview
article-templates/_archived/{slug}/  ← templates removed from Passport;
                                       retained for history, not synced
admin-templates/{slug}/     ← admin templates (type: admin)
admin-templates/_archived/{slug}/

assets/
  *.css                   ← CSS files inlined via {{ assetBody "file.css" }}
assets/_archived/*.css      ← assets removed from Passport; retained, not synced

src/
  pull.js                 ← sync from Passport → local files (handles archival)
  push.js                 ← sync local files → Passport (skips _archived/)
  preview.js              ← render a template locally for review
  upgrade.js              ← pull framework updates from upstream template repo

.claude/skills/              ← Claude Code skill definitions (synced from upstream)
```

## Archival convention

When a template or asset is deleted in Passport, `pull.js` does not delete it locally — it moves it into a sibling `_archived/` directory. `push.js` skips everything under `_archived/`, so archived items are never re-uploaded.

- **Restore** an archived item: `git mv` it back out of `_archived/` and commit. The next push uploads it to Passport.
- **Permanently delete**: `git rm -r article-templates/_archived/<slug>/` and commit.

## The `admin_modified_at` round-trip

When someone edits a template/asset through the Passport admin UI, the API sets `metadata.admin_modified_at` on that item. On the next pull:

1. `pull.js` strips `admin_modified_at` from the local copy and lists the affected slugs/filenames in `.sync-pending.json` (gitignored).
2. The sync-from-passport workflow runs `push.js --only-pending`, which uploads only those items back to Passport with the field cleared, then deletes `.sync-pending.json`.
3. Local changes are committed to `main`.

Without this round-trip, `admin_modified_at` would re-appear on every pull, creating churn.

## `git pull` vs `npm run pull`

The daily sync workflow already commits Passport changes to `main`, so **`git pull origin main` is the routine way to get the latest state** — not `npm run pull`.

`npm run pull` is reserved for:
- **Bootstrapping** a fresh team repo from a Passport instance for the first time.
- **Urgent admin-UI edits** that can't wait for the next scheduled run. If you do this, commit and push the result yourself, otherwise the next scheduled run will produce a duplicate diff.

Be aware: `npm run pull` is a one-way mirror. If you have uncommitted local edits in `article-templates/` or `assets/`, it will overwrite them.

## Commands

| Command | Description |
|---|---|
| `npm run pull` | Bootstrap or sync templates from Passport → local files |
| `npm run push` | Push all local templates and assets → Passport (manual/testing only) |
| `npm run push -- --slug <slug>` | Push a single template |
| `npm run push -- --only-pending` | Push only items listed in `.sync-pending.json` (used by the daily sync workflow) |
| `npm run push -- --dry-run` | Preview what would change without writing |
| `npm run preview -- --slug <slug> --open` | Render template and open in browser |
| `npm run preview -- --slug <slug> --send-to <email>` | Render and send as email via Passport |
| `npm run upgrade` | Pull framework updates (src/, skills, workflows) from upstream template repo |
| `npm run upgrade -- --dry-run` | Preview what would change without writing |
| `npm run upgrade -- --yes` | Skip confirmation prompt |

## Credentials

Stored in `.env` (gitignored) for local use, and in GitHub Actions secrets for CI:
`INSTANCE_HOST`, `CLIENT_ID`, `CLIENT_SECRET`

## Skills

### Auto-invoke — use these automatically when the user's intent matches

Invoke these with the Skill tool **before** responding. Do not ask whether to use them — just use them.

| Skill | Trigger |
|---|---|
| `/passport-templates` | User is writing, reviewing, debugging, or asking about template syntax, helpers, or variables |
| `/new-template` | User wants to create a new template |
| `/preview-template` | User wants to preview or render a template |
| `/pull-template` | User wants to pull/sync templates from Passport, or bootstrap a fresh clone |
| `/rename-template` | User wants to rename a template slug |
| `/archive-template` | User wants to disable, archive, or delete a template |

### Suggest only — do not auto-invoke

| Skill | When to suggest |
|---|---|
| `/push-template` | User explicitly asks for a **manual/direct push** to Passport (not the normal workflow) |

**Deploying = commit + push to git.** When a user says "deploy", "push", "publish", or "ship" a template, guide them through `git add`, `git commit`, `git push origin main`. GitHub Actions handles the Passport sync automatically. Never run `npm run push` unless the user specifically requests a manual push to Passport.
