# New Template Scaffolder

Scaffold a new Passport template directory with all required files.

## Steps

1. Ask the user for:
   - **slug** — kebab-case identifier (e.g. `weekly-newsletter`). This becomes the directory name.
   - **name** — human-readable name (e.g. `Weekly Newsletter`)
   - **channel** — one of: `email`, `sms`, `rss`, `podcast`
   - **type** — `article` (default) or `admin`
   - For email/admin: **from name** and **from email address**

   If the user already provided any of these in their message, don't ask again.

2. Create the directory `article-templates/{slug}/` for type `article`, or `admin-templates/{slug}/` for type `admin`, with three files:

### `article-templates/{slug}/metadata.json` (or `admin-templates/{slug}/metadata.json`)

For **email** channel:
```json
{
  "name": "{name}",
  "slug": "{slug}",
  "type": "{type}",
  "channel": "email",
  "title": "{name}",
  "metadata": {
    "subject": "{{ $article.title }} — {{ $instance.title }}",
    "from_address": { "name": "{from_name}", "email": "{from_email}" },
    "reply_to":     { "name": "{from_name}", "email": "{from_email}" },
    "tokenize_urls": false,
    "inactive": false,
    "audiences": []
  }
}
```

For **sms** channel:
```json
{
  "name": "{name}",
  "slug": "{slug}",
  "type": "{type}",
  "channel": "sms",
  "title": "{name}",
  "metadata": {
    "inactive": false,
    "audiences": []
  }
}
```

For **rss** or **podcast** channel:
```json
{
  "name": "{name}",
  "slug": "{slug}",
  "type": "{type}",
  "channel": "{channel}",
  "title": "{name}",
  "metadata": {
    "inactive": false,
    "audiences": []
  }
}
```

### `article-templates/{slug}/context.json` (or `admin-templates/{slug}/context.json`)

Provide realistic sample data matching the channel. For article templates:
```json
{
  "article": {
    "title": "Sample Article Title",
    "summary": "A short summary of the article used for preview rendering.",
    "body": "<p>This is the body of the article.</p>",
    "uri": "https://example.com/articles/sample",
    "author": "Jane Doe",
    "published_at": "2026-04-10T12:00:00Z",
    "image_uri": "",
    "metadata": {}
  },
  "preheader": "A short summary of the article used for preview rendering.",
  "member": {
    "name": "Test Member",
    "email": "member@example.com"
  },
  "instance": {
    "title": "My Publication"
  }
}
```

For admin templates, replace `article` with the relevant trigger context (e.g. `code`, `link`, `verifyURI`).

### `article-templates/{slug}/template.html` (or `admin-templates/{slug}/template.html`)

For **email** — a complete starter layout:
```html
<style>
{{ assetBody "newsletter.css" }}
</style>

<div style="display:none !important; visibility:hidden; mso-hide:all;
            font-size:1px; line-height:1px; max-height:0px; max-width:0px;
            opacity:0; overflow:hidden;">
  {{ .preheader }}
</div>

{{ $theme    := theme    }}
{{ $instance := instance }}
{{ $article  := article  }}
{{ $user     := user     }}

<table align="center" width="100%" cellpadding="0" cellspacing="0">
  <tbody><tr><td>

    <table align="center">
      <tbody><tr><td>
        <a href="{{ $instance.metadata.home }}">
          <img src="{{ $theme.banner }}" alt="{{ $instance.title }}">
        </a>
      </td></tr></tbody>
    </table>

    <a href="{{ token $article.uri }}">View in browser</a>

    <h1>{{ $article.title }}</h1>
    {{ if .preheader }}<h3>{{ .preheader }}</h3>{{ end }}
    <p>{{ timeFormat $article.published_at "dddd, LL" }} &mdash; {{ $article.author }}</p>

    {{ if $article.image_uri }}
    <img src="{{ $article.image_uri }}" alt="{{ $article.title }}" width="600">
    {{ end }}

    <div>{{ $article.body }}</div>

    <hr>

    {{ if .member.email }}
      Member: {{ .member.name }}<br>
      Email: <a href="mailto:{{ .member.email }}">{{ .member.email }}</a><br>
      {{ if .subscription.created_at }}
        {{ if .account.created_at }}
          Member since: {{ timeFormat .account.created_at "LL" }}<br>
        {{ else }}
          Member since: {{ timeFormat .subscription.created_at "LL" }}<br>
        {{ end }}
        {{ if .subscription.canceled }}
          Auto-renewal is disabled<br>
          Expiration date: {{ timeFormat .subscription.ends_at "LL" }}<br>
        {{ else }}
          Your subscription renews every {{ .subscription.recurring_interval }}<br>
          Renewal date: {{ timeFormat .subscription.ends_at "LL" }}<br>
        {{ end }}
      {{ end }}
    {{ end }}

    You are receiving this email because you are subscribed to
    <a href="{{ $instance.metadata.home }}">{{ $instance.title }}</a>.<br>
    <a href="{{ session (member `/account`) }}">Manage your subscription</a><br>

    {{ with $redirectURI := (member "/unsubscribe") }}
      {{ $optout      := (urlencode (optOut $redirectURI)) }}
      {{ $unsubscribe := (member (print "/unsubscribe?unsub=" $optout)) }}
      <a href="{{ $unsubscribe }}">Unsubscribe</a>
    {{ end }}

    &copy; {{ timeFormat $article.published_at "YYYY" }}
    <a href="{{ $instance.metadata.home }}">{{ $instance.title }}</a>

  </td></tr></tbody>
</table>
```

For **sms**:
```
{{ $article.title }}

{{ $article.summary }}

Read more: {{ shortURL (token $article.uri) }}
```

For **rss**:
```xml
<item>
  <title>{{ $article.title }}</title>
  <description><![CDATA[{{ $article.summary }}]]></description>
  <link>{{ token $article.uri }}</link>
  <pubDate>{{ timeFormat $article.published_at "RFC1123" }}</pubDate>
  <guid isPermaLink="false">{{ $article.uri }}</guid>
  <content:encoded><![CDATA[
    {{ $article.body }}
    <p><a href="[[ session (member "/account") ]]">Manage Subscription</a></p>
  ]]></content:encoded>
</item>
```

For **podcast** — same as RSS but include an `<enclosure>` placeholder:
```xml
<item>
  <title>{{ $article.title }}</title>
  <description><![CDATA[{{ $article.summary }}]]></description>
  <link>{{ token $article.uri }}</link>
  <pubDate>{{ timeFormat $article.published_at "RFC1123" }}</pubDate>
  <guid isPermaLink="false">{{ $article.uri }}</guid>
  <enclosure url="" length="" type="audio/mpeg"/>
  <content:encoded><![CDATA[
    {{ $article.body }}
    <p><a href="[[ session (member "/account") ]]">Manage Subscription</a></p>
  ]]></content:encoded>
</item>
```

3. After creating the files, tell the user:
   - The three files created
   - How to preview: `npm run preview -- --slug {slug} --open`
   - How to push: `npm run push -- --slug {slug}`
