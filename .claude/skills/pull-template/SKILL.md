# Pull Templates

Sync templates and CSS assets from a Passport instance into local files.

## When to use

- **Bootstrap** — first-time setup after cloning the repo, to populate `article-templates/`, `admin-templates/`, and `assets/` from an existing Passport instance.
- **Sync after admin edits** — someone edited a template directly in the Passport UI and the local repo needs to catch up.
- **Audit** — compare what's live in Passport against what's committed in git.

## Steps

1. Check prerequisites:
   - `.env` must exist with valid `INSTANCE_HOST`, `CLIENT_ID`, `CLIENT_SECRET`.
   - If `.env` is missing, tell the user to copy `.env.template` to `.env` and fill in credentials.

2. If the user wants to pull, run:
   ```
   npm run pull
   ```

3. After the pull completes:
   - Suggest the user review the changes with `git diff` to see what Passport had that differed from the local files.
   - For a bootstrap (empty repo), suggest committing everything:
     ```
     git add article-templates/ admin-templates/ assets/
     git commit -m "Bootstrap templates from Passport"
     ```
   - For a sync, suggest reviewing each changed file before committing — the Passport version may have unintended edits that should be reverted rather than committed.

4. On failure, diagnose:
   - Authentication error → check `.env` credentials
   - Network error → verify `INSTANCE_HOST` is reachable
   - Empty result → the Passport instance may have no templates yet

## Important notes

- `npm run pull` **overwrites** local files with the current Passport state. If the user has uncommitted local changes, warn them to commit or stash first.
- Pull does not delete local templates that no longer exist in Passport — orphaned local directories will remain.
- `context.json` files are preserved if they already exist locally (pull only creates a default if one is missing).
- After pulling, the normal workflow resumes: edit locally, commit, push to `main`, GitHub Actions syncs back to Passport.
