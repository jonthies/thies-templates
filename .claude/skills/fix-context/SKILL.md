# Fix Admin Template Context

Audit and fix `context.json` files in `admin-templates/` so the sample data matches what the template actually uses.

## When to use

- When a user asks to fix, audit, or update context for admin templates
- When context.json contains placeholder data (e.g. `article` fields) that doesn't match the template variables
- Can target a single template by slug or scan all admin templates

## Steps

1. **Determine scope:**
   - If the user provided a slug, work on just that template.
   - If a template file is open in the IDE, infer the slug from its path.
   - Otherwise, scan all directories under `admin-templates/`.

2. **For each template, read `template.html` and extract all context variables:**

   Parse the template for `.variable` references — these are the context fields the template expects. Ignore built-in helpers and their arguments:
   - `theme`, `instance`, `article`, `user` (top-level builtins accessed via `$var`)
   - `$theme.*`, `$instance.*`, `$article.*`, `$user.*` (builtin fields)
   - Helper functions: `assetBody`, `timeFormat`, `token`, `session`, `member`, `shortURL`, `currency`, `urlencode`, `optOut`, `printf`, `sub`, `index`, `print`
   - Control flow: `if`, `else`, `end`, `range`, `with`
   - Comments inside `{{/* ... */}}`

   Context variables are dot-prefixed references that access the template's root data context:
   - `.member.name`, `.member.email`
   - `.subscription.ends_at`, `.subscription.canceled`, etc.
   - `.stripe.invoice.Total`, `.stripe.charge.AmountRefunded`, etc.
   - `.invite.to.name`, `.invite.invite_code`, etc.
   - `.credit.owner_email.name`, `.credit.amount`, etc.
   - `.code`, `.link`, `.verifyURI`
   - `.preheader`
   - `.timestamp`
   - Any other `.field` or `.field.subfield` reference

   Also look for variables assigned from context with `$var := .something` — these also indicate required context fields.

3. **Read the current `context.json` and compare:**
   - **Missing fields:** the template references `.foo.bar` but context.json has no `foo.bar`
   - **Extra fields:** context.json has keys (like `article`, `preheader`) that the template never references
   - **Matched:** context.json already provides all needed fields

4. **If mismatched or incomplete, rewrite `context.json`:**
   - Include only the fields the template actually uses
   - Use realistic sample values that match the field semantics:
     - Names: `"Jane Doe"`, `"John Smith"`
     - Emails: `"jane@example.com"`, `"john@example.com"`
     - Amounts (in cents): `16900`, `2980`, etc.
     - Timestamps: ISO 8601 format, use dates near today
     - URLs: `"https://example.com/..."` or `"https://pay.stripe.com/receipts/example"`
     - Codes/tokens: `"abc123"`
     - Stripe invoice line items: include at least one item with `Description` and `Amount`
   - Do NOT include `instance`, `theme`, or other builtin data — those come from helpers, not context

5. **Report results:**
   - For each template processed, state whether it was already correct, updated, or had issues
   - Show what changed (fields added/removed)

## Example

Given a template containing:
```handlebars
<p>Hi {{ .member.name }},</p>
<p>Your refund for {{ currency .stripe.charge.AmountRefunded }} has been processed.</p>
<a href="{{ .stripe.charge.ReceiptURL }}">Download Receipt</a>
```

The correct context.json is:
```json
{
  "member": {
    "name": "Jane Doe"
  },
  "stripe": {
    "charge": {
      "AmountRefunded": 16900,
      "ReceiptURL": "https://pay.stripe.com/receipts/example"
    }
  }
}
```

NOT the generic article placeholder:
```json
{
  "article": { "title": "Sample Article Title", ... },
  "preheader": "..."
}
```
