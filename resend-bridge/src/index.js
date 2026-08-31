import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Webhook } from 'svix';
import { config, validateConfig } from './config.js';
import { sendEmail, addSuppression } from './resend-client.js';
import { syncEventToTwenty } from './twenty-client.js';
import { getBlastJob, previewBlast, startBlast } from './blast.js';
import { tryAcquireSendSlot } from './rate-limit.js';
import { templateRouter } from './template-routes.js';
import { loadTemplateHtml } from './template-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILDER_HTML = readFileSync(join(__dirname, 'public', 'builder.html'), 'utf8');

const app = express();

// ─── Raw body capture for svix verification ────────────
app.use(express.json({
  limit: '2mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));



// ─── Auth middleware ────────────────────────────────────
function requireBridgeAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token || !validateToken(token)) {
    return res.status(401).json({ success: false, error: 'Unauthorized — provide a valid Bridge API key' });
  }
  next();
}

function validateToken(token) {
  if (!config.bridge.apiKey) return false;
  try {
    const key = Buffer.from(config.bridge.apiKey);
    const input = Buffer.from(token);
    return key.length === input.length && timingSafeEqual(key, input);
  } catch {
    return false;
  }
}

// ─── Resend webhook verification (svix) ─────────────────
function verifyResendWebhook(req, res, next) {
  if (!config.webhook.secret) {
    return next();
  }
  const wh = new Webhook(config.webhook.secret);
  const body = req.rawBody;
  if (!body) {
    return res.status(400).json({ success: false, error: 'Missing body' });
  }
  try {
    const payload = wh.verify(body.toString(), {
      'svix-id': req.headers['svix-id'] || '',
      'svix-timestamp': req.headers['svix-timestamp'] || '',
      'svix-signature': req.headers['svix-signature'] || '',
    });
    req.verifiedPayload = payload;
    next();
  } catch (err) {
    console.warn('[webhook] svix verification failed:', err.message);
    return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
  }
}

// ─── HMAC unsubscribe token ─────────────────────────────
function buildUnsubscribeToken(email, campaignId) {
  const data = `${email}:${campaignId || ''}`;
  const hmac = createHmac('sha256', config.bridge.apiKey).update(data).digest('base64url');
  return `${data}:${hmac}`;
}

function verifyUnsubscribeToken(token) {
  if (!token) return null;
  const parts = token.split(':');
  if (parts.length < 3) return null;
  const hmac = parts.pop();
  const data = parts.join(':');
  const expected = createHmac('sha256', config.bridge.apiKey).update(data).digest('base64url');
  try {
    const hmacBuf = Buffer.from(hmac, 'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (hmacBuf.length !== expBuf.length || !timingSafeEqual(hmacBuf, expBuf)) {
      return null;
    }
  } catch {
    return null;
  }
  const [email, ...rest] = parts;
  return { email, campaignId: rest.join(':') || '' };
}

// ═══════════════════════════════════════════════════════
//  HEALTH
// ═══════════════════════════════════════════════════════
app.get('/healthz', (_req, res) => {
  res.json({
    status: 'ok',
    resend: !!config.resend.apiKey && !config.resend.apiKey.startsWith('re_xxxxx'),
    twenty: !!config.twenty.apiKey,
    uptime: process.uptime(),
  });
});

// ═══════════════════════════════════════════════════════
//  SEND EMAIL
// ═══════════════════════════════════════════════════════
app.post('/api/send', requireBridgeAuth, async (req, res) => {
  const { to, from, subject, html, text, headers, campaignId, templateId } = req.body || {};

  if (!to || !subject) {
    return res.status(400).json({ success: false, error: 'to and subject are required' });
  }

  let bodyHtml = html;
  if (!bodyHtml && templateId) {
    const saved = loadTemplateHtml(templateId);
    if (!saved) {
      return res.status(404).json({ success: false, error: `Template not found: ${templateId}` });
    }
    bodyHtml = saved;
  }
  if (!bodyHtml) {
    return res.status(400).json({ success: false, error: 'html or templateId is required' });
  }

  if (!tryAcquireSendSlot()) {
    return res.status(429).json({ success: false, error: 'Rate limit exceeded — try again shortly' });
  }

  const result = await sendEmail({ to, from, subject, html: bodyHtml, text, headers, campaignId });

  if (!result.success) {
    return res.status(502).json(result);
  }

  res.json(result);
});

// ═══════════════════════════════════════════════════════
//  RESEND WEBHOOK
// ═══════════════════════════════════════════════════════
app.post('/webhooks/resend', verifyResendWebhook, async (req, res) => {
  res.status(200).json({ received: true });

  const payload = req.verifiedPayload || req.body;
  const eventType = payload?.type || payload?.event || 'unknown';
  const email =
    payload?.data?.email || payload?.data?.to || payload?.record?.to || '';
  const campaignId =
    payload?.data?.tags?.map?.(t => t.value)?.join(',') ||
    payload?.data?.tags?.campaign ||
    payload?.data?.campaign_id ||
    payload?.campaign || '';

  if (!email) return;

  const eventMap = {
    'email.delivered': 'delivered',
    'email.opened': 'opened',
    'email.clicked': 'clicked',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.failed': 'failed',
  };
  const mappedType = eventMap[eventType] || eventType;

  console.log(`[webhook] ${mappedType} for ${email} (campaign: ${campaignId || 'N/A'})`);

  if (['bounced', 'complained', 'failed'].includes(mappedType)) {
    const supResult = await addSuppression(email);
    if (!supResult.success) {
      console.warn(`[suppression] addSuppression failed for ${email}: ${supResult.error}`);
    }
  }

  if (config.twenty.apiKey) {
    const syncResult = await syncEventToTwenty(email, mappedType, campaignId);
    const allOk = Object.values(syncResult).every(r => r?.success !== false);
    if (!allOk) {
      console.warn(`[twenty-sync] ${email} ${mappedType}: partial failure —`, JSON.stringify(syncResult));
    }
  }
});

// ═══════════════════════════════════════════════════════
//  UNSUBSCRIBE
// ═══════════════════════════════════════════════════════
app.get('/unsubscribe', (req, res) => {
  const { email, campaign, t } = req.query;
  if (!email) return res.status(400).send('Missing email parameter');

  if (t) {
    const verified = verifyUnsubscribeToken(t);
    if (!verified || verified.email !== email) {
      return res.status(400).send(renderPage('Invalid Link', `
        <div class="card">
          <h1>Invalid Unsubscribe Link</h1>
          <p>This link is invalid or has been tampered with. Please contact support.</p>
        </div>`));
    }
  }

  res.type('html').send(renderPage('Unsubscribe', `
    <div class="card">
      <h1>Unsubscribe</h1>
      <p>We're sorry to see you go. Confirm below to stop receiving emails from us.</p>
      <p class="email">${escapeHtml(email)}</p>
      <form method="POST" action="/unsubscribe">
        <input type="hidden" name="email" value="${escapeHtml(email)}" />
        <input type="hidden" name="campaign" value="${escapeHtml(campaign || '')}" />
        <input type="hidden" name="t" value="${escapeHtml(t || '')}" />
        <button type="submit" class="btn">Yes, unsubscribe me</button>
      </form>
    </div>`));
});

app.post('/unsubscribe', async (req, res) => {
  const { email, campaign, t } = req.body || {};
  if (!email) return res.status(400).send('Missing email');

  if (t) {
    const verified = verifyUnsubscribeToken(t);
    if (!verified || verified.email !== email) {
      return res.status(400).send(renderPage('Invalid Link', `
        <div class="card">
          <h1>Invalid Unsubscribe Link</h1>
          <p>This link is invalid or has been tampered with. Please contact support.</p>
        </div>`));
    }
  }

  console.log(`[unsubscribe] ${email} from campaign ${campaign || 'N/A'}`);

  const supResult = await addSuppression(email);
  if (!supResult.success) {
    console.warn(`[unsubscribe] addSuppression failed for ${email}: ${supResult.error}`);
  }

  if (config.twenty.apiKey) {
    const syncResult = await syncEventToTwenty(email, 'unsubscribed', campaign);
    const allOk = Object.values(syncResult).every(r => r?.success !== false);
    if (!allOk) {
      console.warn(`[unsubscribe] twenty-sync ${email}: partial failure`);
    }
  }

  res.type('html').send(renderPage('Unsubscribed', `
    <div class="card">
      <div class="check">&#10003;</div>
      <h1>You've been unsubscribed</h1>
      <p>You will no longer receive emails from us at <strong>${escapeHtml(email)}</strong>.</p>
      <p>This change may take a few minutes to take effect.</p>
    </div>`));
});

// ═══════════════════════════════════════════════════════
//  ONE-TIME BLAST
// ═══════════════════════════════════════════════════════
app.post('/api/blast/preview', requireBridgeAuth, async (req, res) => {
  const { source, messageListId, companyId, personIds } = req.body || {};
  const result = await previewBlast({ source, messageListId, companyId, personIds });
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/blast', requireBridgeAuth, (req, res) => {
  const {
    html,
    subject,
    campaignId,
    source,
    emails,
    templateId,
    messageListId,
    companyId,
    personIds,
  } = req.body || {};
  let bodyHtml = html;
  if (!bodyHtml && templateId) {
    bodyHtml = loadTemplateHtml(templateId);
    if (!bodyHtml) {
      return res.status(404).json({ success: false, error: `Template not found: ${templateId}` });
    }
  }
  const result = startBlast({
    html: bodyHtml,
    subject,
    campaignId,
    source,
    messageListId,
    companyId,
    personIds,
  });
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

app.get('/api/blast/:id', requireBridgeAuth, (req, res) => {
  const job = getBlastJob(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Blast not found' });
  res.json({ success: true, job });
});

// ═══════════════════════════════════════════════════════
//  EMAIL TEMPLATE BUILDER
// ═══════════════════════════════════════════════════════
app.use('/api/templates', requireBridgeAuth, templateRouter);

app.get('/builder', (_req, res) => {
  res.type('html').send(BUILDER_HTML);
});

// ═══════════════════════════════════════════════════════
//  STARTUP
// ═══════════════════════════════════════════════════════
const warnings = validateConfig();
if (warnings.length) {
  console.warn('⚠️  Configuration warnings:');
  warnings.forEach((w) => console.warn(`   • ${w}`));
}

app.listen(config.port, () => {
  console.log(`✅ Resend Bridge listening on :${config.port}`);
  console.log(`   Send endpoint:  POST /api/send  (auth: Bearer <BRIDGE_API_KEY>)`);
  console.log(`   Webhook URL:    POST /webhooks/resend  (svix: ${config.webhook.secret ? 'verified' : 'UNVERIFIED'})`);
  console.log(`   Unsubscribe:    GET  /unsubscribe?email=…`);
  console.log(`   Builder:        GET  /builder  +  API /api/templates`);
  console.log(`   Public base:    ${config.bridge.publicBaseUrl}`);
  console.log(`   Twenty API:     ${config.twenty.apiUrl}  (${config.twenty.apiKey ? 'configured' : 'NOT set'})`);
});

// ─── Helpers ──────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderPage(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #f7f8fa; color: #1a1a1a; min-height: 100vh; display: flex;
      align-items: center; justify-content: center; padding: 24px;
    }
    .card {
      background: #fff; border-radius: 16px; padding: 48px 40px; max-width: 440px;
      width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,.08);
    }
    h1 { font-size: 24px; margin-bottom: 12px; }
    p { font-size: 15px; line-height: 1.6; color: #555; margin-bottom: 8px; }
    .email { font-weight: 600; color: #111; word-break: break-all; }
    .btn {
      display: inline-block; margin-top: 20px; padding: 14px 32px; background: #6366f1;
      color: #fff; border: none; border-radius: 10px; font-size: 15px; font-weight: 600;
      cursor: pointer; width: 100%; transition: background .2s;
    }
    .btn:hover { background: #4f46e5; }
    .check { font-size: 48px; color: #22c55e; margin-bottom: 16px; }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}