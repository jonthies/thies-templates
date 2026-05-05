# Preview Template

Render a local Passport template and open it in the browser.

## Steps

1. Determine the slug:
   - If the user provided a slug in their message, use it.
   - If a template file is open in the IDE, infer the slug from its path (`article-templates/{slug}/...` or `admin-templates/{slug}/...`).
   - Otherwise, list the available slugs from `templates/` and ask the user to choose.

2. Check for optional flags the user mentioned:
   - `--open` — open the output in the browser (default: yes, include it unless they said not to)
   - `--article-id <id>` — render using a real article from Passport by its ID; **mutually exclusive with `--context`** (when provided, context.json is ignored)
   - `--context <file>` — custom context JSON file path (ignored if `--article-id` is given)
   - `--channel <channel>` — override the channel (`email`, `rss`, `podcast`, `sms`)
   - `--send-to <email>` — send the rendered HTML as an email via the Passport email API (useful for testing in Outlook or other email clients)

3. Run the preview command:
   ```
   npm run preview -- --slug {slug} --open
   ```
   Adjust flags based on what the user asked for. Examples:
   - With a real article: `npm run preview -- --slug {slug} --article-id {id} --open`
   - With custom context: `npm run preview -- --slug {slug} --context path/to/context.json --open`
   - Send as email: `npm run preview -- --slug {slug} --send-to user@example.com`
   - Render real article and send: `npm run preview -- --slug {slug} --article-id {id} --send-to user@example.com`

4. Report the result:
   - On success: tell the user the output was saved to `preview-output/{slug}.html` and opened in the browser.
   - On failure: show the error output and diagnose the likely cause:
     - `article-templates/{slug}/ not found` → wrong slug or need to run `npm run pull` first
     - Authentication error → check `.env` credentials
     - Missing `template.html` → the template directory is incomplete

## Notes

- Preview always uses the **local** `template.html` body (with local CSS assets inlined), sending it to the Passport `templatePreview` API for server-side rendering.
- `--article-id` and `--context` are mutually exclusive: `--article-id` takes precedence and the API fetches article data server-side, ignoring any local context.
- `--send-to` sends the rendered HTML as an actual email via `POST /api/1.0.0/email`. This is the best way to test how a template looks in Outlook or other email clients. The subject line is `Preview: <template name>`. Can be combined with `--open`, `--article-id`, etc.
- The output file is gitignored — it's local only.
- If the user wants to preview with different article data, they can either edit `templates/{slug}/context.json`, pass `--context path/to/other.json`, or use `--article-id` to render against a live Passport article.
