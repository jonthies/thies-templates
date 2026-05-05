# Passport Template Agent

A GitOps tool for managing [Passport](https://passport.online) email templates and CSS assets via a git repository. Edit templates locally, push to `main`, and GitHub Actions automatically syncs them to your Passport instance.

---

## How It Works

```
Local file edits   →  git push       →  GitHub Actions  →  Passport API updated
Passport admin UI  →  daily cron     →  GitHub Actions  →  commit to main
                                                            (so `git pull` gets it)
Passport instance  →  npm run pull   →  local files bootstrapped (one-time / escape hatch)
Local template     →  npm run preview →  preview-output/{slug}.html
```

Two GitHub Actions workflows keep things in sync. `sync.yml` pushes your commits to Passport. `sync-from-passport.yml` runs daily to pull any admin-UI edits back into git, so a routine `git pull origin main` is enough to stay current — you don't need to run `npm run pull` day-to-day.

Templates are stored as plain HTML files alongside a `metadata.json` that captures the template settings and a `context.json` with sample data for local preview. CSS asset files live in `assets/`. All content is versioned in git, giving you full history, diffs, PR reviews, and rollback for free.

---

## Getting Started (New Repository)

### 1. Create your own copy

Click **"Use this template"** on GitHub to create a private copy under your own account. Do **not** fork — the template button creates a clean repo with no shared history.

Clone your new repo:

```bash
git clone https://github.com/YOUR_ORG/YOUR_REPO.git
cd YOUR_REPO
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure credentials

Copy the environment template and fill in your Passport credentials:

```bash
cp .env.template .env
```

Create `CLIENT_ID` and `CLIENT_SECRET`

In your Passport admin, create a new Integration of type "API/OpenID"  and copy the Client ID and Client Secret here.


Edit `.env`:

```
INSTANCE_HOST=api.mysite.com
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
```

### 4. Bootstrap from your existing Passport instance

Pull all existing templates and CSS assets into local files:

```bash
npm run pull
```

This creates:
- `article-templates/{slug}/template.html` — body for regular (`type: article`) templates
- `admin-templates/{slug}/template.html` — body for admin (`type: admin`) templates
- `{article-templates,admin-templates}/{slug}/metadata.json` — name, channel, subject, from address, events, etc.
- `{article-templates,admin-templates}/{slug}/context.json` — sample data for local preview
- `assets/{filename}.css` — CSS asset files

Review what was pulled, then commit:

```bash
git add .
git commit -m "Bootstrap templates from Passport"
git push
```

### 5. Set up GitHub Actions secrets

In your GitHub repository, go to **Settings → Secrets and variables → Actions** and add these three secrets (same values as your `.env`):

| Secret name | Description |
|---|---|
| `INSTANCE_HOST` | Your Passport instance hostname |
| `CLIENT_ID` | OAuth client ID |
| `CLIENT_SECRET` | OAuth client secret |

From this point on, any push to `main` that changes files under `article-templates/`, `admin-templates/`, or `assets/` will automatically sync to Passport.

---

## Daily Workflow

### Edit a template

Open `article-templates/{slug}/template.html` or `admin-templates/{slug}/template.html` in your editor and make changes. Templates use [Go template syntax](https://pkg.go.dev/text/template) with Passport-specific helpers.

**Article template variables** (accessed via the `article` helper):

| Variable | Description |
|---|---|
| `$article.title` | Article title |
| `$article.summary` | Article summary / excerpt |
| `$article.body` | Full article HTML |
| `$article.image_uri` | Hero image URL |
| `$article.uri` | Article permalink |
| `$article.author` | Author name |
| `$article.published_at` | Publication date |

**Instance / theme variables** (always injected server-side):

| Variable | Description |
|---|---|
| `$instance.title` | Publication name |
| `$instance.metadata.home` | Site home URL |
| `$theme.banner` | Banner image URL |

**Admin template variables** (depend on the event that triggers the template):

| Event type | Variables available |
|---|---|
| `charge.refunded` / `charge.failed` | `member`, `stripe.charge` (Amount, AmountRefunded, ReceiptURL) |
| `invoice.payment_succeeded` / `invoice.upcoming` | `member`, `stripe.invoice` (Total, AmountPaid, Lines.Data, HostedInvoiceURL) |
| `customer.subscription.deleted` | `member` |
| `user.signup.email` / `user.email.verify` | `member`, `token` |
| `user.password.email` | `member`, `code`, `link` |
| `email.sender.verify` | `member`, `email.address`, `link` |
| `team.invite.redeemed` / `gift.invite.redeemed` | `invite`, `credit` |
| `user.*` (welcome, expiry, etc.) | `member` |

Declare instance/theme at the top of any template:

```html
{{ $theme := theme }}
{{ $instance := instance }}
{{ $article := article }}
```

Inline a CSS asset:

```html
<style>{{ assetBody "newsletter.css" }}</style>
```

### Preview before pushing

Preview always renders your **local** `template.html` body by sending it to `POST /api/1.0.0/templates/render`. The sample data in `context.json` is passed as the render context.

```bash
# Render and open in browser
npm run preview -- --slug newsletter --open

# Render without opening
npm run preview -- --slug refund-email

# Use a custom context file instead of context.json
npm run preview -- --slug newsletter --context sample-data/article.json --open

# Render against a real article from Passport (by article ID)
npm run preview -- --slug newsletter --article-id <article-id> --open

# Override the channel
npm run preview -- --slug newsletter --channel rss

# Send the rendered preview as an email (useful for testing in Outlook, etc.)
npm run preview -- --slug newsletter --send-to you@example.com

# Combine flags: render a real article and send it
npm run preview -- --slug newsletter --article-id <article-id> --send-to you@example.com
```

When `--article-id` is passed, Passport loads the real article from its database and uses it to populate `$article` in the template. The local `template.html` body is still used, so you see your local edits rendered against real content.

The rendered HTML is saved to `preview-output/{slug}.html` (gitignored).

> **Note:** The template must exist in Passport before you can preview it. Run `npm run push -- --slug <slug>` first if it's brand new.

### Context files

Each template has a `context.json` that provides sample data for preview. The format matches what Passport injects at send time.

**Article templates** — wrap article data under the `article` key:

```json
{
  "article": {
    "title": "My Article",
    "summary": "A short summary.",
    "body": "<p>Article content...</p>",
    "uri": "https://example.com/articles/my-article",
    "image_uri": "https://example.com/image.jpg",
    "author": "Jane Doe",
    "published_at": "2026-01-01T12:00:00Z"
  },
  "preheader": "A short summary."
}
```

A full-featured sample article is included at `sample-data/article.json` — use it with `--context`:

```bash
npm run preview -- --slug newsletter --context sample-data/article.json --open
```

**Admin templates** — provide the fields that the event would inject:

```json
{
  "member": { "name": "Jane Doe", "email": "jane@example.com" },
  "stripe": {
    "charge": {
      "AmountRefunded": 4999,
      "ReceiptURL": "https://pay.stripe.com/receipts/example"
    }
  }
}
```

> **Note:** `theme`, `instance`, and `user` are always injected server-side by Passport — do not put them in `context.json`.

### Push to Passport

Push all templates and assets:

```bash
npm run push
```

Preview what would change first (no writes):

```bash
npm run push -- --dry-run
```

Push a single template:

```bash
npm run push -- --slug welcome-email
```

### Pull latest from Passport

In normal use, **just `git pull origin main`** — the daily sync workflow has already pulled Passport changes and committed them.

`npm run pull` is reserved for two cases:

1. **Bootstrapping** a fresh repo from a Passport instance for the first time.
2. **Urgent admin-UI edits** that can't wait for the next scheduled run. Commit and push the result yourself afterwards, otherwise the next scheduled run will produce a duplicate diff.

```bash
npm run pull
```

> **Warning:** `npm run pull` is a one-way mirror. Uncommitted local edits in `article-templates/`, `admin-templates/`, or `assets/` will be overwritten.

---

## Template File Structure

Templates are split into two directories based on their `type`:

- `article-templates/` — regular templates (`type: article`) — newsletters, RSS, podcast
- `admin-templates/` — admin templates (`type: admin`) — transactional emails, auth, billing

Each template lives in its own slug subdirectory:

```
article-templates/
  newsletter/
    template.html    ← HTML body using Go template syntax
    metadata.json    ← template settings and event triggers
    context.json     ← sample data for npm run preview

admin-templates/
  refund-email/
    template.html
    metadata.json
    context.json

assets/
  newsletter.css
  passport_admin.css

sample-data/
  article.json       ← full sample article for newsletter preview
```

### metadata.json reference

```json
{
  "name": "Refund Email",
  "slug": "refund-email",
  "type": "admin",
  "channel": "email",
  "title": "Your refund receipt from {{ .instance.title }}",
  "metadata": {
    "subject": "",
    "from_address": {},
    "reply_to": {},
    "tokenize_urls": false,
    "inactive": false,
    "audiences": []
  },
  "events": [
    {
      "event_source": "stripe",
      "event_type": "charge.refunded",
      "channel": "email",
      "enabled": true
    }
  ]
}
```

**`type`** options: `article`, `admin`

**`channel`** options: `email`, `rss`, `podcast`, `sms`

### CSS assets

Drop `.css` files into `assets/`. Reference them inside a template using the `assetBody` helper:

```html
<style>
  {{ assetBody "newsletter.css" }}
</style>
```

When you run `npm run push`, both the template and the CSS file are uploaded to Passport. During local preview, `assetBody` references are resolved from your local `assets/` folder.

---

## Commands Reference

| Command | Description |
|---|---|
| `npm run pull` | Pull all templates and CSS assets from Passport → local files |
| `npm run push` | Push all local templates and CSS assets → Passport |
| `npm run push -- --dry-run` | Preview changes without writing anything |
| `npm run push -- --slug <slug>` | Push only one template |
| `npm run push -- --only-pending` | Push only items listed in `.sync-pending.json` (used by the daily sync workflow to clear `admin_modified_at`) |
| `npm run preview -- --slug <slug>` | Render template, save to `preview-output/<slug>.html` |
| `npm run preview -- --slug <slug> --open` | Render and open in browser |
| `npm run preview -- --slug <slug> --context <file>` | Render with a custom context JSON file |
| `npm run preview -- --slug <slug> --article-id <id>` | Render against a real article from Passport |
| `npm run preview -- --slug <slug> --channel <channel>` | Override the channel for render |
| `npm run preview -- --slug <slug> --send-to <email>` | Render and send as email via Passport |
| `npm run upgrade` | Pull framework updates (src/, skills, workflows) from upstream template repo |
| `npm run upgrade -- --dry-run` | Preview what would change without writing |
| `npm run upgrade -- --yes` | Skip confirmation prompt |

---

## Upgrading the Framework

If the upstream template repository (`passport-online/template_agent`) has been updated with bug fixes or new features, you can pull those changes into your copy without affecting your templates or assets:

```bash
# See what would change
npm run upgrade -- --dry-run

# Apply the update
npm run upgrade
```

This updates `src/`, `.claude/skills/`, `.github/workflows/sync.yml`, and merges `package.json` dependencies (your custom additions are preserved). Your templates, assets, and `.env` are never touched.

After upgrading, review the changes and commit:

```bash
git diff
npm install        # if package.json changed
git add -A
git commit -m "Upgrade framework from upstream"
git push
```

---

## Publishing Your Own Copy as a Template Repository

If you want others on your team to create their own repos from yours:

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create my-passport-templates --private --source=. --push
```

Then in GitHub → repo Settings → check **"Template repository"**. Team members can click **"Use this template"** to spin up their own private copy.

---

## Security Notes

- Never commit your `.env` file — it is listed in `.gitignore`
- Store credentials only in GitHub Actions secrets (Settings → Secrets → Actions)
- The `CLIENT_ID` / `CLIENT_SECRET` grant application-level access — treat them like passwords
