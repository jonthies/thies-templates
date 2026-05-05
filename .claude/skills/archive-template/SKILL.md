# Archive Template

Disable a template in Passport by marking it inactive. This is the correct way to "delete" a template — removing the directory locally does **not** remove it from Passport.

## Why archive instead of delete

There is no delete operation in the Passport API. If you delete a template directory from the repo and push, the template remains active in Passport — it just stops being managed by git. Always archive first, then optionally remove the local directory.

## Steps

1. Determine the slug:
   - If the user provided a slug, use it.
   - If a template file is open in the IDE, infer the slug from its path.
   - Otherwise, list available slugs and ask.

2. Locate the template in `article-templates/{slug}/` or `admin-templates/{slug}/`.

3. Read `metadata.json` and check whether `"inactive"` is already `true`. If it is, tell the user the template is already archived.

4. Set `"inactive": true` in `metadata.json` under the `metadata` key:
   ```json
   {
     "metadata": {
       "inactive": true,
       ...
     }
   }
   ```

5. Tell the user:
   - The template is now marked inactive locally.
   - To deploy: commit and push to `main` — GitHub Actions will update Passport.
   - The local directory can optionally be deleted after the push completes, but keeping it is fine (it serves as a record and can be reactivated later by setting `"inactive": false`).
   - To reactivate later: set `"inactive": false` in `metadata.json`, commit, and push.

## Reactivating

If the user wants to reactivate an archived template, set `"inactive": false` in `metadata.json`, commit, and push. The template will be updated in Passport and become active again.
