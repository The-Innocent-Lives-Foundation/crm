import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_DIR = process.env.TEMPLATE_DATA_DIR || join(__dirname, '..', 'data');
const STORE_FILE = join(STORE_DIR, 'templates.json');

let templates = load();

function load() {
  try {
    if (existsSync(STORE_FILE)) {
      return JSON.parse(readFileSync(STORE_FILE, 'utf8'));
    }
  } catch (err) {
    console.warn('[templates] failed to load store:', err.message);
  }
  return {};
}

function persist() {
  mkdirSync(STORE_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(templates, null, 2));
}

export function listTemplates() {
  return Object.values(templates)
    .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getTemplate(id) {
  return templates[id] || null;
}

export function saveTemplate({ id, name, html, css, json }) {
  if (!id) id = randomUUID();
  templates[id] = {
    id,
    name: name || 'Untitled',
    html: html || '',
    css: css || '',
    json: json || '',
    updatedAt: new Date().toISOString(),
  };
  persist();
  return templates[id];
}

export function deleteTemplate(id) {
  const exists = Object.prototype.hasOwnProperty.call(templates, id);
  if (exists) {
    delete templates[id];
    persist();
  }
  return exists;
}

export function loadTemplateHtml(id) {
  return templates[id]?.html || null;
}