import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { waitForSendSlot } from './rate-limit.js';
import { buildUnsubscribeUrl, sendEmail } from './resend-client.js';
import {
  listPeopleByCompany,
  listPeopleByIds,
  listPeopleOnMessageList,
  listSuppressedEmails,
} from './twenty-client.js';

const jobs = new Map();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 5000;

function applyVariables(value, variables) {
  if (!value) return value;
  return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, name) => {
    const key = name.trim();
    return key in variables ? String(variables[key] ?? '') : `{{${name}}}`;
  });
}

function personVariables(person) {
  const email = person?.emails?.primaryEmail || '';
  return {
    'person.name.firstName': person?.name?.firstName || '',
    'person.name.lastName': person?.name?.lastName || '',
    'person.emails.primaryEmail': email,
    'person.jobTitle': person?.jobTitle || '',
    'person.city': person?.city || '',
    'person.company.name': person?.company?.name || '',
    'sender.name': config.resend.fromName || '',
    'sender.email': config.resend.fromEmail || '',
    currentYear: String(new Date().getUTCFullYear()),
    email,
  };
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    total: job.total,
    sent: job.sent,
    failed: job.failed,
    skipped: job.skipped,
    error: job.error || null,
    errors: job.errors.slice(-20),
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || null,
  };
}

export function getBlastJob(id) {
  const job = jobs.get(id);
  return job ? publicJob(job) : null;
}

export async function previewBlast(input) {
  const resolved = await resolveRecipients(input);
  if (!resolved.success) return resolved;
  return {
    success: true,
    total: resolved.recipients.length,
    skipped: resolved.skipped,
    sample: resolved.recipients.slice(0, 8).map((r) => r.email),
  };
}

export function startBlast({
  html,
  subject,
  campaignId,
  source,
  messageListId,
  companyId,
  personIds,
}) {
  if (!html) return { success: false, error: 'html is required' };
  if (!subject) return { success: false, error: 'subject is required' };

  const id = randomUUID();
  const job = {
    id,
    status: 'queued',
    total: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    error: null,
    errors: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    html,
    subject,
    campaignId: campaignId || `blast-${new Date().toISOString().slice(0, 10)}`,
    source,
    messageListId,
    companyId,
    personIds: Array.isArray(personIds) ? personIds : [],
  };
  jobs.set(id, job);
  setTimeout(() => jobs.delete(id), 6 * 60 * 60 * 1000);

  void runBlast(job);
  return { success: true, job: publicJob(job) };
}

async function loadPeople({ source, messageListId, companyId, personIds }) {
  if (source === 'messageList') {
    if (!messageListId) return { success: false, error: 'Pick a list' };
    return listPeopleOnMessageList(messageListId);
  }
  if (source === 'company') {
    if (!companyId) return { success: false, error: 'Pick a company' };
    return listPeopleByCompany(companyId);
  }
  if (source === 'selected') {
    const ids = Array.isArray(personIds) ? personIds.filter(Boolean) : [];
    if (!ids.length) return { success: false, error: 'Pick at least one person' };
    return listPeopleByIds(ids);
  }
  return { success: false, error: 'Pick list, company, or people' };
}

async function resolveRecipients(input) {
  const suppressedResult = await listSuppressedEmails();
  const suppressed = new Set(
    (suppressedResult.success ? suppressedResult.data : [])
      .map((row) => String(row.email || '').trim().toLowerCase())
      .filter(Boolean),
  );

  const peopleResult = await loadPeople(input);
  if (!peopleResult.success) return peopleResult;

  const seen = new Set();
  const recipients = [];
  let skipped = 0;

  const add = (email, variables) => {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || !EMAIL_RE.test(normalized)) {
      skipped += 1;
      return;
    }
    if (seen.has(normalized) || suppressed.has(normalized)) {
      skipped += 1;
      return;
    }
    seen.add(normalized);
    recipients.push({ email: normalized, variables });
  };

  for (const person of peopleResult.data) {
    add(person?.emails?.primaryEmail, personVariables(person));
  }

  if (recipients.length > MAX_RECIPIENTS) {
    return {
      success: false,
      error: `Too many recipients (${recipients.length}). Max is ${MAX_RECIPIENTS}.`,
    };
  }

  return { success: true, recipients, skipped };
}

async function runBlast(job) {
  job.status = 'running';
  const resolved = await resolveRecipients({
    source: job.source,
    messageListId: job.messageListId,
    companyId: job.companyId,
    personIds: job.personIds,
  });

  if (!resolved.success) {
    job.status = 'failed';
    job.error = resolved.error;
    job.finishedAt = new Date().toISOString();
    return;
  }

  job.total = resolved.recipients.length;
  job.skipped = resolved.skipped;

  for (const recipient of resolved.recipients) {
    const unsubUrl = buildUnsubscribeUrl(recipient.email, job.campaignId);
    const variables = { ...recipient.variables, unsubscribeUrl: unsubUrl };
    const html = applyVariables(job.html, variables);
    const subject = applyVariables(job.subject, variables);

    await waitForSendSlot();
    const result = await sendEmail({
      to: recipient.email,
      subject,
      html,
      campaignId: job.campaignId,
    });

    if (result.success) {
      job.sent += 1;
    } else {
      job.failed += 1;
      job.errors.push({ email: recipient.email, error: result.error });
      if (/rate|429|too many/i.test(String(result.error || ''))) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  job.status = 'done';
  job.finishedAt = new Date().toISOString();
}
