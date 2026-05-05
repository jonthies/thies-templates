# Rename Template

Rename a template's slug. This requires updating both the local directory and the metadata, and understanding the Passport-side implications.

## Steps

1. Ask the user for:
   - **Current slug** — the existing directory name. If a template file is open in the IDE, infer it from the path.
   - **New slug** — must be kebab-case (e.g. `weekly-digest`).

2. Locate the template directory in `article-templates/{old-slug}/` or `admin-templates/{old-slug}/`.

3. Check if `metadata.json` has `"inactive": true`. If so, warn the user that this template is currently disabled in Passport and ask if they want to proceed.

4. Rename the directory:
   ```
   mv article-templates/{old-slug} article-templates/{new-slug}
   ```
   (or `admin-templates/` for admin templates)

5. Update `metadata.json`:
   - Set `"slug"` to the new slug value.

6. Warn the user about the Passport side effect:
   - **The old template in Passport will remain under the old slug.** Pushing will create a new template with the new slug rather than renaming the existing one.
   - The old template should be archived by setting `"inactive": true` in the Passport UI, or the user can create a temporary `article-templates/{old-slug}/metadata.json` with `"inactive": true`, push it, and then delete the directory.
   - There is no rename or delete operation in the Passport API — this is a create-new + archive-old workflow.

7. Suggest next steps:
   - Preview the renamed template: `npm run preview -- --slug {new-slug} --open`
   - Commit and push to deploy the new slug and archive the old one.
