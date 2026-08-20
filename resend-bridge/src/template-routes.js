import { Router } from 'express';
import juice from 'juice';
import { deleteTemplate, getTemplate, listTemplates, saveTemplate } from './template-store.js';

export const templateRouter = Router();

function inlineTemplate(html, css) {
  return juice(html || '', { extraCss: css || '', removeStyleTags: true });
}

templateRouter.get('/', (_req, res) => {
  res.json(listTemplates());
});

templateRouter.get('/:id', (req, res) => {
  const t = getTemplate(req.params.id);
  if (!t) return res.status(404).json({ success: false, error: 'Template not found' });
  res.json(t);
});

templateRouter.post('/', (req, res) => {
  const { name, html, css, json } = req.body || {};
  if (!name || !html) {
    return res.status(400).json({ success: false, error: 'name and html are required' });
  }
  res.json(saveTemplate({ name, html: inlineTemplate(html, css), css, json }));
});

templateRouter.put('/:id', (req, res) => {
  const existing = getTemplate(req.params.id);
  if (!existing) return res.status(404).json({ success: false, error: 'Template not found' });
  const { name, html, css, json } = req.body || {};
  res.json(saveTemplate({
    id: existing.id,
    name: name ?? existing.name,
    html: html ? inlineTemplate(html, css ?? existing.css) : existing.html,
    css: css ?? existing.css,
    json: json ?? existing.json,
  }));
});

templateRouter.delete('/:id', (req, res) => {
  if (!deleteTemplate(req.params.id)) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }
  res.json({ success: true });
});