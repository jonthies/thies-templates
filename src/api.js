import dotenv from 'dotenv';

dotenv.config();

const buildFormData = (params) =>
  Object.keys(params)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');

/**
 * Obtain an OAuth access token using client credentials.
 */
export const getToken = async (apiHost, instance) => {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('CLIENT_ID and CLIENT_SECRET must be set in .env');
  }

  const body = buildFormData({
    instance,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  const resp = await fetch(`https://${apiHost}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Auth failed: ${resp.status} ${resp.statusText} — ${text}`);
  }

  return resp.json();
};

/**
 * Shared config loader — reads INSTANCE_HOST from .env.
 */
export const getConfig = () => {
  const instanceHost = process.env.INSTANCE_HOST;
  if (!instanceHost) throw new Error('INSTANCE_HOST must be set in .env');
  return { apiHost: instanceHost, instance: instanceHost };
};

const authHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

const checkResponse = async (resp) => {
  if (resp.ok) return resp;
  const text = await resp.text();
  const err = new Error(`API ${resp.status} ${resp.statusText}: ${text}`);
  err.status = resp.status;
  throw err;
};

const safeJson = async (resp) => {
  const text = await resp.text();
  if (!text || !text.trim()) return {};
  return JSON.parse(text);
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/**
 * List all templates.
 */
export const templateList = async (apiHost, token) => {
  const resp = await fetch(`https://${apiHost}/api/1.0.0/templates?limit=500`, {
    headers: authHeaders(token),
  });
  await checkResponse(resp);
  return resp.json();
};

/**
 * Create a new template.
 */
export const templateCreate = async (apiHost, token, template) => {
  const resp = await fetch(`https://${apiHost}/api/1.0.0/templates`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(template),
  });
  await checkResponse(resp);
  return resp.json();
};

/**
 * Update an existing template by ID.
 */
export const templateUpdate = async (apiHost, token, id, template) => {
  const resp = await fetch(`https://${apiHost}/api/1.0.0/templates/${id}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(template),
  });
  await checkResponse(resp);
  return resp.json();
};

/**
 * Render a template that already exists in Passport (by ID).
 * Returns the rendered HTML string.
 */
export const templateRender = async (apiHost, token, templateId, render) => {
  const resp = await fetch(`https://${apiHost}/api/1.0.0/templates/${templateId}/render`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(render),
  });
  await checkResponse(resp);
  return resp.text();
};

/**
 * Render a template from raw HTML without a specific template ID.
 * Returns the rendered HTML string.
 */
export const templatePreview = async (apiHost, token, render) => {
  const resp = await fetch(`https://${apiHost}/api/1.0.0/templates/render`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(render),
  });
  await checkResponse(resp);
  return resp.text();
};

// ---------------------------------------------------------------------------
// Assets (CSS files)
// ---------------------------------------------------------------------------

/**
 * List assets. Pass mimeType e.g. 'text/css' to filter.
 */
export const assetList = async (apiHost, token, mimeType = 'text/css', limit = 500) => {
  const params = new URLSearchParams({ limit, links: true, preload: true });
  if (mimeType) params.set('mime_type', mimeType);

  const resp = await fetch(`https://${apiHost}/api/1.0.0/assets?${params}`, {
    headers: authHeaders(token),
  });
  await checkResponse(resp);
  return resp.json();
};

/**
 * Get a single asset. Pass returnPayload=true to include base64-encoded content.
 */
export const assetGet = async (apiHost, token, assetId, returnPayload = false) => {
  const params = new URLSearchParams({ link: true });
  if (returnPayload) params.set('payload', true);

  const resp = await fetch(`https://${apiHost}/api/1.0.0/assets/${assetId}?${params}`, {
    headers: authHeaders(token),
  });
  await checkResponse(resp);
  return resp.json();
};

/**
 * Upload a new text asset (e.g. a CSS file).
 * content is a string; filename is e.g. 'newsletter.css'.
 */
export const assetCreate = async (apiHost, token, filename, content, mimeType = 'text/css') => {
  const form = new FormData();
  const blob = new Blob([content], { type: mimeType });
  form.append('file', blob, filename);
  form.append('mime_type', mimeType);
  form.append('overwrite', 'true');

  const resp = await fetch(`https://${apiHost}/api/1.0.0/assets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  await checkResponse(resp);
  return safeJson(resp);
};

/**
 * Update an existing asset's content by ID.
 */
export const assetUpdate = async (apiHost, token, assetId, filename, content, mimeType = 'text/css') => {
  const form = new FormData();
  const blob = new Blob([content], { type: mimeType });
  form.append('file', blob, filename);

  const resp = await fetch(`https://${apiHost}/api/1.0.0/assets/${assetId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  await checkResponse(resp);
  return safeJson(resp);
};

/**
 * Make an asset public by ID.
 */
export const assetMakePublic = async (apiHost, token, assetId) => {
  const form = new FormData();
  form.append('public', 'true');
  form.append('description', ' ');

  const resp = await fetch(`https://${apiHost}/api/1.0.0/assets/${assetId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  await checkResponse(resp);
  return safeJson(resp);
};

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/**
 * Send an email via the Passport email API.
 * html is the rendered HTML string; it will be base64-encoded before sending.
 *
 * @param {string} to - recipient email address
 * @param {string} subject - email subject line
 * @param {string} html - rendered HTML content
 * @param {object} from - { address, name } sender info from metadata
 * @param {object} reply_to - { address, name } reply-to info from metadata
 */
export const emailSend = async (apiHost, token, { to, subject, html, from, reply_to }) => {
  const payload = {
    body: Buffer.from(html).toString('base64'),
    subject,
    to: [{ name: to, address: to }],
    immediate: true,
  };
  if (from) payload.from = from;
  if (reply_to) payload.reply_to = reply_to;

  const resp = await fetch(`https://${apiHost}/api/1.0.0/email`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  await checkResponse(resp);
  return safeJson(resp);
};
