import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import grapesjsPresetNewsletter from 'grapesjs-preset-newsletter';
import { useEffect, useRef, useState } from 'react';

import { getTokenPair } from '@/apollo/utils/getTokenPair';

const GRAPHQL_URL = '/graphql';

function gql(query: string, variables?: Record<string, unknown>) {
  return fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ query, variables }),
  }).then((r) => r.json());
}

type TemplateSummary = { id: string; name: string };

const MERGE_TAG_GROUPS = [
  {
    category: 'Person (Contact)',
    tags: [
      { label: 'First Name', tag: '{{person.name.firstName}}', desc: 'e.g. John' },
      { label: 'Last Name', tag: '{{person.name.lastName}}', desc: 'e.g. Doe' },
      { label: 'Email', tag: '{{person.emails.primaryEmail}}', desc: 'e.g. john@example.com' },
      { label: 'Job Title', tag: '{{person.jobTitle}}', desc: 'e.g. Director' },
      { label: 'Company Name', tag: '{{person.company.name}}', desc: 'e.g. Acme Corp' },
      { label: 'City', tag: '{{person.city}}', desc: 'e.g. New York' },
    ],
  },
  {
    category: 'Sender / Workspace',
    tags: [
      { label: 'Sender Name', tag: '{{sender.name}}', desc: 'Your display name' },
      { label: 'Sender Email', tag: '{{sender.email}}', desc: 'notifications@go...' },
      { label: 'Current Year', tag: '{{currentYear}}', desc: 'e.g. 2026' },
      { label: 'Unsubscribe URL', tag: '{{unsubscribeUrl}}', desc: 'One-click unsubscribe link' },
    ],
  },
];

const DEFAULT_HTML =
  '<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">' +
  '<tr><td align="center">' +
  '<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;margin:20px auto;border-radius:8px;overflow:hidden;">' +
  '<tr><td style="padding:32px 24px;">' +
  '<h1 style="margin:0 0 12px;font-family:Helvetica,Arial,sans-serif;color:#111827;font-size:24px;">Hi {{person.name.firstName}},</h1>' +
  '<p style="margin:0 0 20px;font-family:Helvetica,Arial,sans-serif;color:#4b5563;font-size:15px;line-height:1.6;">Thank you for your interest in Innocent Lives Foundation.</p>' +
  '<table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#6366f1;border-radius:6px;">' +
  '<a href="https://example.com" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-weight:600;font-size:14px;">View Details</a>' +
  '</td></tr></table>' +
  '<p style="margin:30px 0 0;font-family:Helvetica,Arial,sans-serif;color:#9ca3af;font-size:12px;text-align:center;">' +
  '<a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>' +
  '</p>' +
  '</td></tr>' +
  '</table>' +
  '</td></tr>' +
  '</table>';

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  padding: '8px 14px',
  borderBottom: '1px solid #e5e7eb',
  background: '#fff',
  flexWrap: 'wrap',
};

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 7,
  fontSize: 13,
};

const buttonStyle: React.CSSProperties = {
  padding: '6px 14px',
  border: 'none',
  borderRadius: 7,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  color: '#fff',
  background: '#6366f1',
};

type BlastSource = 'messageList' | 'company' | 'selected';
type NamedOption = { id: string; name: string };
type PersonOption = { id: string; label: string; email: string };

const personLabel = (node: {
  name?: { firstName?: string; lastName?: string };
  emails?: { primaryEmail?: string };
}) => {
  const name = [node.name?.firstName, node.name?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const email = node.emails?.primaryEmail || '';
  return name ? `${name} (${email})` : email || 'No email';
};

export const EmailBuilderPage = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<ReturnType<typeof grapesjs.init> | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('Untitled');
  const [subject, setSubject] = useState('');
  const [status, setStatus] = useState('');
  const [showMergeMenu, setShowMergeMenu] = useState(false);
  const [showBlast, setShowBlast] = useState(false);
  const [blastSource, setBlastSource] = useState<BlastSource>('selected');
  const [blastListId, setBlastListId] = useState('');
  const [blastCompanyId, setBlastCompanyId] = useState('');
  const [blastPersonIds, setBlastPersonIds] = useState<string[]>([]);
  const [blastLists, setBlastLists] = useState<NamedOption[]>([]);
  const [blastCompanies, setBlastCompanies] = useState<NamedOption[]>([]);
  const [blastPeople, setBlastPeople] = useState<PersonOption[]>([]);
  const [blastPersonQuery, setBlastPersonQuery] = useState('');
  const [blastCampaignId, setBlastCampaignId] = useState('');
  const [blastPreview, setBlastPreview] = useState<{
    total: number;
    skipped: number;
    sample: string[];
  } | null>(null);
  const [blastJob, setBlastJob] = useState<{
    id: string;
    status: string;
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    error?: string | null;
  } | null>(null);
  const [blastBusy, setBlastBusy] = useState(false);

  const getAccessToken = () =>
    getTokenPair()?.accessOrWorkspaceAgnosticToken?.token || '';

  const blastApi = async (
    path: string,
    method: string,
    body?: Record<string, unknown>,
  ) => {
    const opts: RequestInit = {
      method,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAccessToken()}`,
      },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const response = await fetch(`/rest/email-blast${path}`, opts);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || payload.error || 'Blast request failed');
    }
    return payload;
  };

  const blastAudience = () => ({
    source: blastSource,
    messageListId: blastListId || undefined,
    companyId: blastCompanyId || undefined,
    personIds: blastPersonIds,
  });

  const edgesToOptions = (
    connection: { edges?: { node: { id: string; name?: string } }[] } | undefined,
  ): NamedOption[] =>
    (connection?.edges ?? []).map((edge) => ({
      id: edge.node.id,
      name: edge.node.name || 'Untitled',
    }));

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;

    const editor = grapesjs.init({
      container: containerRef.current,
      height: '100%',
      width: '100%',
      fromElement: false,
      plugins: [grapesjsPresetNewsletter],
      pluginsOpts: {
        [grapesjsPresetNewsletter as unknown as string]: {
          inlineCss: true,
          showBlocksOnLoad: true,
          showStylesOnChange: true,
        },
      },
      storageManager: false,
      blockManager: {
        appendTo: '',
      },
    });

    editor.on('load', () => {
      editor.setComponents(DEFAULT_HTML);

      // Custom Merge Field Block
      editor.BlockManager.add('merge-tag-firstname', {
        label: '👤 First Name',
        category: 'Merge Fields',
        content: '{{person.name.firstName}}',
      });
      editor.BlockManager.add('merge-tag-lastname', {
        label: '👤 Last Name',
        category: 'Merge Fields',
        content: '{{person.name.lastName}}',
      });
      editor.BlockManager.add('merge-tag-email', {
        label: '✉️ Email',
        category: 'Merge Fields',
        content: '{{person.emails.primaryEmail}}',
      });
      editor.BlockManager.add('merge-tag-company', {
        label: '🏢 Company',
        category: 'Merge Fields',
        content: '{{person.company.name}}',
      });
      editor.BlockManager.add('merge-tag-unsub', {
        label: '🔕 Unsubscribe Link',
        category: 'Merge Fields',
        content: '<a href="{{unsubscribeUrl}}">Unsubscribe</a>',
      });

      // Standard Content Blocks
      editor.BlockManager.add('sect100', {
        label: '1 Column Section',
        category: 'Layout',
        content: '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:20px;"><p>Content</p></td></tr></table>',
      });
      editor.BlockManager.add('sect50', {
        label: '2 Column Section',
        category: 'Layout',
        content: '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="50%" style="padding:10px;"><p>Column 1</p></td><td width="50%" style="padding:10px;"><p>Column 2</p></td></tr></table>',
      });
      editor.BlockManager.add('text', {
        label: 'Text',
        category: 'Basic',
        content: '<p style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#4b5563;">Edit text or insert a {merge field} from above.</p>',
      });
      editor.BlockManager.add('heading', {
        label: 'Heading',
        category: 'Basic',
        content: '<h2 style="font-family:Helvetica,Arial,sans-serif;font-size:22px;color:#111827;margin:0 0 10px;">Heading</h2>',
      });
      editor.BlockManager.add('button', {
        label: 'Button',
        category: 'Basic',
        content: '<table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#6366f1;border-radius:6px;"><a href="https://example.com" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-weight:600;font-size:14px;">Button</a></td></tr></table>',
      });
      editor.BlockManager.add('image', {
        label: 'Image',
        category: 'Basic',
        content: '<img src="https://via.placeholder.com/600x200" style="max-width:100%;height:auto;display:block;" alt="Image" />',
      });
      editor.BlockManager.add('divider', {
        label: 'Divider',
        category: 'Basic',
        content: '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />',
      });

      editor.runCommand('open-blocks');
    });

    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  const loadList = async () => {
    try {
      const res = await gql(`
        query ListEmailTemplates {
          emailTemplates(first: 100) {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      `);
      const edges = res.data?.emailTemplates?.edges ?? [];
      const list = edges.map((edge: { node: { id: string; name: string } }) => ({
        id: edge.node.id,
        name: edge.node.name,
      }));
      setTemplates(list);
      if (list.length > 0 && !selectedId) {
        await openTemplate(list[0].id);
      }
    } catch (error) {
      setStatus(`Load failed: ${(error as Error).message}`);
    }
  };

  useEffect(() => {
    void loadList();
  }, []);

  const openTemplate = async (id: string) => {
    try {
      const res = await gql(`
        query GetEmailTemplate($id: ID!) {
          emailTemplate(id: $id) {
            id
            name
            subject
            html
            css
            json
          }
        }
      `, { id });
      const template = res.data?.emailTemplate;
      if (!template) return;
      setSelectedId(template.id);
      setName(template.name ?? 'Untitled');
      setSubject(template.subject ?? '');
      const editor = editorRef.current;
      if (editor) {
        editor.setComponents(template.html || DEFAULT_HTML);
        if (template.css) editor.setStyle(template.css);
      }
    } catch (error) {
      setStatus(`Open failed: ${(error as Error).message}`);
    }
  };

  const handleNew = () => {
    setSelectedId('');
    setName('New Template');
    setSubject('');
    editorRef.current?.setComponents(DEFAULT_HTML);
    editorRef.current?.setStyle('');
  };

  const handleSave = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const html = editor.getHtml();
    const css = editor.getCss();
    const json = JSON.stringify(editor.getComponents().toJSON());

    try {
      if (selectedId) {
        await gql(`
          mutation UpdateEmailTemplate($id: ID!, $name: String, $subject: String, $html: String, $css: String, $json: String) {
            updateEmailTemplate(id: $id, data: { name: $name, subject: $subject, html: $html, css: $css, json: $json }) {
              id
            }
          }
        `, { id: selectedId, name, subject, html, css, json });
      } else {
        const res = await gql(`
          mutation CreateEmailTemplate($name: String!, $subject: String, $html: String, $css: String, $json: String) {
            createEmailTemplate(data: { name: $name, subject: $subject, html: $html, css: $css, json: $json }) {
              id
            }
          }
        `, { name, subject, html, css, json });
        const newId = res.data?.createEmailTemplate?.id;
        if (newId) setSelectedId(newId);
      }
      setStatus('Saved');
      void loadList();
    } catch (error) {
      setStatus(`Save failed: ${(error as Error).message}`);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    try {
      await gql(`
        mutation DeleteEmailTemplate($id: ID!) {
          deleteEmailTemplate(id: $id) {
            id
          }
        }
      `, { id: selectedId });
      setStatus('Deleted');
      handleNew();
      void loadList();
    } catch (error) {
      setStatus(`Delete failed: ${(error as Error).message}`);
    }
  };

  const openBlast = async () => {
    if (!selectedId) {
      setStatus('Save the template first');
      return;
    }
    setShowBlast(true);
    setBlastJob(null);
    setBlastPreview(null);
    setBlastCampaignId(
      `blast-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${new Date().toISOString().slice(0, 10)}`,
    );
    try {
      const [listsRes, companiesRes, peopleRes] = await Promise.all([
        gql(`query { messageLists(first: 100) { edges { node { id name } } } }`),
        gql(`query { companies(first: 100) { edges { node { id name } } } }`),
        gql(`
          query {
            people(first: 100) {
              edges {
                node {
                  id
                  name { firstName lastName }
                  emails { primaryEmail }
                }
              }
            }
          }
        `),
      ]);
      setBlastLists(edgesToOptions(listsRes.data?.messageLists));
      setBlastCompanies(edgesToOptions(companiesRes.data?.companies));
      setBlastPeople(
        (peopleRes.data?.people?.edges ?? []).map(
          (edge: {
            node: {
              id: string;
              name?: { firstName?: string; lastName?: string };
              emails?: { primaryEmail?: string };
            };
          }) => ({
            id: edge.node.id,
            label: personLabel(edge.node),
            email: edge.node.emails?.primaryEmail || '',
          }),
        ),
      );
    } catch (error) {
      setStatus(`Load recipients failed: ${(error as Error).message}`);
    }
  };

  const refreshBlastPreview = async (audience = blastAudience()) => {
    if (
      (audience.source === 'messageList' && !audience.messageListId) ||
      (audience.source === 'company' && !audience.companyId) ||
      (audience.source === 'selected' && audience.personIds.length === 0)
    ) {
      setBlastPreview({ total: 0, skipped: 0, sample: [] });
      return;
    }
    try {
      const payload = await blastApi('/preview', 'POST', audience);
      setBlastPreview({
        total: payload.total ?? 0,
        skipped: payload.skipped ?? 0,
        sample: payload.sample ?? [],
      });
    } catch (error) {
      setBlastPreview(null);
      setStatus(`Preview failed: ${(error as Error).message}`);
    }
  };

  const searchPeople = async (query: string) => {
    setBlastPersonQuery(query);
    const trimmed = query.trim();
    const res = await gql(
      trimmed
        ? `
          query SearchPeople($q: String!) {
            people(
              first: 50
              filter: {
                or: [
                  { name: { firstName: { ilike: $q } } }
                  { name: { lastName: { ilike: $q } } }
                  { emails: { primaryEmail: { ilike: $q } } }
                ]
              }
            ) {
              edges {
                node {
                  id
                  name { firstName lastName }
                  emails { primaryEmail }
                }
              }
            }
          }
        `
        : `
          query {
            people(first: 100) {
              edges {
                node {
                  id
                  name { firstName lastName }
                  emails { primaryEmail }
                }
              }
            }
          }
        `,
      trimmed ? { q: `%${trimmed}%` } : undefined,
    );
    setBlastPeople(
      (res.data?.people?.edges ?? []).map(
        (edge: {
          node: {
            id: string;
            name?: { firstName?: string; lastName?: string };
            emails?: { primaryEmail?: string };
          };
        }) => ({
          id: edge.node.id,
          label: personLabel(edge.node),
          email: edge.node.emails?.primaryEmail || '',
        }),
      ),
    );
  };

  const togglePerson = (id: string) => {
    setBlastPersonIds((current) => {
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      void refreshBlastPreview({
        source: 'selected',
        personIds: next,
        messageListId: undefined,
        companyId: undefined,
      });
      return next;
    });
  };

  const startBlastSend = async () => {
    if (!selectedId || blastBusy) return;
    const count = blastPreview?.total ?? 0;
    if (count < 1) {
      setStatus('No recipients');
      return;
    }
    if (
      !window.confirm(
        `Send "${subject || name}" to ${count} recipient${count === 1 ? '' : 's'}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBlastBusy(true);
    try {
      await handleSave();
      const payload = await blastApi('', 'POST', {
        templateId: selectedId,
        subject,
        campaignId: blastCampaignId,
        ...blastAudience(),
      });
      const job = payload.job;
      setBlastJob(job);
      pollBlast(job.id);
    } catch (error) {
      setBlastBusy(false);
      setStatus(`Blast failed: ${(error as Error).message}`);
    }
  };

  const pollBlast = (id: string) => {
    const tick = async () => {
      try {
        const payload = await blastApi(`/${id}`, 'GET');
        const job = payload.job;
        setBlastJob(job);
        if (job.status === 'queued' || job.status === 'running') {
          window.setTimeout(() => void tick(), 1000);
          return;
        }
        setBlastBusy(false);
        setStatus(
          job.status === 'done'
            ? `Blast done: ${job.sent} sent, ${job.failed} failed, ${job.skipped} skipped`
            : `Blast ${job.status}${job.error ? `: ${job.error}` : ''}`,
        );
      } catch (error) {
        setBlastBusy(false);
        setStatus(`Blast status failed: ${(error as Error).message}`);
      }
    };
    void tick();
  };

  const insertMergeTag = (tag: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selected = editor.getSelected();
    if (selected) {
      const type = selected.get('type');
      if (type === 'text') {
        const content = selected.get('content') || '';
        selected.set('content', content + ' ' + tag);
      } else {
        editor.addComponents(`<p>${tag}</p>`);
      }
    } else {
      editor.addComponents(`<p>${tag}</p>`);
    }
    setShowMergeMenu(false);
    setStatus(`Inserted ${tag}`);
  };

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>
      <div style={toolbarStyle}>
        <select
          style={inputStyle}
          value={selectedId}
          onChange={(event) => {
            const id = event.target.value;
            if (id) void openTemplate(id);
          }}
        >
          <option value="">(new)</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <button
          style={{ ...buttonStyle, background: '#e5e7eb', color: '#111827' }}
          onClick={handleNew}
        >
          + New
        </button>
        <input
          style={{ ...inputStyle, minWidth: 140 }}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Template name"
        />
        <input
          style={{ ...inputStyle, minWidth: 180 }}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Email subject (supports {{fields}})"
        />

        {/* Merge Tags Picker Dropdown */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button
            style={{
              ...buttonStyle,
              background: '#4f46e5',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            onClick={() => setShowMergeMenu(!showMergeMenu)}
          >
            <span>✨ Insert Variable</span>
            <span style={{ fontSize: 10 }}>▼</span>
          </button>

          {showMergeMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                width: 320,
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                zIndex: 9999,
                padding: '8px 0',
                maxHeight: 400,
                overflowY: 'auto',
              }}
            >
              {MERGE_TAG_GROUPS.map((group) => (
                <div key={group.category}>
                  <div
                    style={{
                      padding: '6px 12px',
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: '#6b7280',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {group.category}
                  </div>
                  {group.tags.map((t) => (
                    <button
                      key={t.tag}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f3f4f6';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                      onClick={() => insertMergeTag(t.tag)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                          {t.label}
                        </span>
                        <code
                          style={{
                            fontSize: 11,
                            background: '#eef2ff',
                            color: '#4f46e5',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontFamily: 'monospace',
                          }}
                        >
                          {t.tag}
                        </code>
                      </div>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{t.desc}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <button style={buttonStyle} onClick={() => void handleSave()}>
          Save
        </button>
        <button
          style={{ ...buttonStyle, background: '#ef4444' }}
          onClick={() => void handleDelete()}
          disabled={!selectedId}
        >
          Del
        </button>
        <button
          style={{ ...buttonStyle, background: '#0f766e' }}
          onClick={() => void openBlast()}
          disabled={!selectedId}
        >
          Send blast
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>{status}</span>
      </div>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
      {showBlast && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(17,24,39,0.45)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => !blastBusy && setShowBlast(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              width: '100%',
              maxWidth: 480,
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Send blast</h2>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#4b5563' }}>
              Sends this saved template once. Skips suppressed and empty emails.
              Merge tags like {'{{person.name.firstName}}'} are filled per person.
            </p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              Recipients
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {([
                ['messageList', 'List'],
                ['company', 'Company'],
                ['selected', 'People'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  style={{
                    ...buttonStyle,
                    background: blastSource === value ? '#0f766e' : '#e5e7eb',
                    color: blastSource === value ? '#fff' : '#111827',
                  }}
                  onClick={() => {
                    setBlastSource(value);
                    void refreshBlastPreview({
                      source: value,
                      messageListId: blastListId || undefined,
                      companyId: blastCompanyId || undefined,
                      personIds: blastPersonIds,
                    });
                  }}
                  disabled={blastBusy}
                >
                  {label}
                </button>
              ))}
            </div>
            {blastSource === 'messageList' && (
              <select
                style={{ ...inputStyle, width: '100%', marginBottom: 12 }}
                value={blastListId}
                disabled={blastBusy}
                onChange={(event) => {
                  setBlastListId(event.target.value);
                  void refreshBlastPreview({
                    source: 'messageList',
                    messageListId: event.target.value || undefined,
                    companyId: undefined,
                    personIds: [],
                  });
                }}
              >
                <option value="">
                  {blastLists.length ? 'Pick a list' : 'No lists yet — create one under Lists'}
                </option>
                {blastLists.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            )}
            {blastSource === 'company' && (
              <select
                style={{ ...inputStyle, width: '100%', marginBottom: 12 }}
                value={blastCompanyId}
                disabled={blastBusy}
                onChange={(event) => {
                  setBlastCompanyId(event.target.value);
                  void refreshBlastPreview({
                    source: 'company',
                    companyId: event.target.value || undefined,
                    messageListId: undefined,
                    personIds: [],
                  });
                }}
              >
                <option value="">Pick a company</option>
                {blastCompanies.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            )}
            {blastSource === 'selected' && (
              <div style={{ marginBottom: 12 }}>
                <input
                  style={{ ...inputStyle, width: '100%', marginBottom: 8 }}
                  value={blastPersonQuery}
                  disabled={blastBusy}
                  placeholder="Search people"
                  onChange={(event) => void searchPeople(event.target.value)}
                />
                <div
                  style={{
                    maxHeight: 180,
                    overflowY: 'auto',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  {blastPeople.length === 0 && (
                    <div style={{ fontSize: 12, color: '#6b7280' }}>No people found</div>
                  )}
                  {blastPeople.map((person) => (
                    <label
                      key={person.id}
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        fontSize: 13,
                        padding: '4px 0',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={blastPersonIds.includes(person.id)}
                        disabled={blastBusy}
                        onChange={() => togglePerson(person.id)}
                      />
                      <span>{person.label}</span>
                    </label>
                  ))}
                </div>
                {blastPersonIds.length > 0 && (
                  <div style={{ fontSize: 12, color: '#4b5563', marginTop: 6 }}>
                    {blastPersonIds.length} selected
                  </div>
                )}
              </div>
            )}
            <input
              style={{ ...inputStyle, width: '100%', marginBottom: 12 }}
              value={blastCampaignId}
              disabled={blastBusy}
              onChange={(event) => setBlastCampaignId(event.target.value)}
              placeholder="Campaign id (tracking)"
            />
            {blastPreview && (
              <p style={{ margin: '0 0 12px', fontSize: 13 }}>
                <strong>{blastPreview.total}</strong> will be sent
                {blastPreview.skipped > 0 ? `, ${blastPreview.skipped} skipped` : ''}.
                {blastPreview.sample.length > 0
                  ? ` Sample: ${blastPreview.sample.join(', ')}`
                  : ''}
              </p>
            )}
            {blastJob && (
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#0f766e' }}>
                {blastJob.status}: {blastJob.sent}/{blastJob.total} sent
                {blastJob.failed ? `, ${blastJob.failed} failed` : ''}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                style={{ ...buttonStyle, background: '#e5e7eb', color: '#111827' }}
                onClick={() => setShowBlast(false)}
                disabled={blastBusy}
              >
                Close
              </button>
              <button
                style={buttonStyle}
                onClick={() => void startBlastSend()}
                disabled={blastBusy || !blastPreview || blastPreview.total < 1}
              >
                {blastBusy
                  ? 'Sending…'
                  : `Send ${blastPreview?.total ?? 0} email${(blastPreview?.total ?? 0) === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
