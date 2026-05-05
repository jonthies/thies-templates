# Push Template

This project is a GitOps framework. **The normal way to deploy templates is to commit and push to `main` — GitHub Actions handles the sync to Passport automatically.**

## Default behavior: deploy via git

**Never run `npm run push` unless the user explicitly asks for a manual/direct push.** When a user says "deploy", "push", "publish", or "ship" a template, guide them through committing and pushing to git:

1. Review the changed files with `git diff` or `git status`.
2. Stage the relevant template and asset files.
3. Commit with a clear message.
4. Push to `main`.

```
git add article-templates/{slug}/ assets/
git commit -m "Update {slug} template"
git push origin main
```

GitHub Actions (`.github/workflows/sync.yml`) triggers automatically on any push to `main` that touches `article-templates/`, `admin-templates/`, or `assets/`, and runs `node src/push.js` to sync everything to Passport.

This keeps the git repo as the single source of truth and prevents Passport from drifting out of sync with what's committed.

---

## Manual push (only when explicitly requested)

`npm run push` bypasses git and pushes directly to Passport. **Only use this when the user specifically says "manual push", "push directly to Passport", "test against Passport", or "verify credentials".**

If the user asks for a manual push:

1. Determine scope from the user's message:
   - **Single template** — user named a slug or has a template file open in the IDE
   - **All templates** — user said "all", "everything", or didn't specify
   - **Dry run** — user said "dry run", "preview changes", "what would change", or "check"

2. Always suggest a dry-run first:
   ```
   npm run push -- --dry-run
   npm run push -- --slug {slug} --dry-run
   ```

3. Only after the user confirms, run the actual push:
   ```
   npm run push -- --slug {slug}
   npm run push
   ```

4. Warn the user that the repo is now out of sync — they should commit their changes to git so the repo matches what's live in Passport.

5. On failure, diagnose:
   - Authentication error → check `.env` for valid `CLIENT_ID`, `CLIENT_SECRET`, `INSTANCE_HOST`
   - `metadata.json` parse error → show the file and the JSON error
   - Network error → verify `INSTANCE_HOST` is reachable

---

## Setting up a new installation repo

When someone is setting up their own repo from this template:

1. Click **"Use this template"** on GitHub (not fork — template gives a clean history)
2. Clone and run `npm install`
3. Copy `.env.template` to `.env` and fill in credentials
4. Run `npm run pull` to bootstrap local files from their Passport instance
5. Commit and push — GitHub Actions takes over from here
6. Add three secrets in GitHub → Settings → Secrets → Actions:
   - `INSTANCE_HOST`, `CLIENT_ID`, `CLIENT_SECRET`

After step 6, every push to `main` that changes `article-templates/`, `admin-templates/`, or `assets/` auto-syncs to Passport.
