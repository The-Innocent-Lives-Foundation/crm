import { createHmac } from 'node:crypto';
import { Resend } from 'resend';
import { config } from './config.js';

const resend = new Resend(config.resend.apiKey);

export async function sendEmail({ to, from, subject, html, text, headers, campaignId }) {
  const fromAddress = from || (config.resend.fromName
    ? `${config.resend.fromName} <${config.resend.fromEmail}>`
    : config.resend.fromEmail);

  const recipientList = Array.isArray(to) ? to : [to];

  const unsubUrl = buildUnsubscribeUrl(recipientList[0], campaignId);
  const extraHeaders = {
    'List-Unsubscribe': `<${unsubUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    ...(headers || {}),
  };

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: recipientList,
      subject,
      html: html || `<p>${text || subject}</p>`,
      text,
      headers: extraHeaders,
      tags: campaignId ? [{ name: 'campaign', value: campaignId }] : undefined,
    });

    if (error) {
      return { success: false, error: error.message || String(error) };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

export async function addSuppression(email) {
  try {
    const body = { email, unsubscribed: true };
    if (config.resend.audienceId) {
      body.audience_id = config.resend.audienceId;
    }
    const res = await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.resend.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      return { success: false, error: json.message || `HTTP ${res.status}` };
    }
    return { success: true, contactId: json.id };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

function buildUnsubscribeUrl(email, campaignId) {
  const token = buildHmacToken(email, campaignId);
  const params = new URLSearchParams({ email, t: token });
  if (campaignId) params.set('campaign', campaignId);
  return `${config.bridge.publicBaseUrl}/unsubscribe?${params.toString()}`;
}

function buildHmacToken(email, campaignId) {
  const data = `${email}:${campaignId || ''}`;
  const hmac = createHmac('sha256', config.bridge.apiKey).update(data).digest('base64url');
  return `${data}:${hmac}`;
}