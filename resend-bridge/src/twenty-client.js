import { config } from './config.js';

async function graphql(query, variables = {}) {
  if (!config.twenty.apiKey) {
    return { success: false, error: 'TWENTY_API_KEY not configured' };
  }
  try {
    const res = await fetch(config.twenty.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.twenty.apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    const json = await res.json();
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}`, detail: json };
    }
    if (json.errors) {
      return { success: false, error: json.errors[0]?.message || 'GraphQL error' };
    }
    return { success: true, data: json.data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function findPersonByEmail(email) {
  const query = /* GraphQL */ `
    query FindPersonByEmail($emailFilter: String) {
      people(filter: { emails: { primaryEmail: { eq: $emailFilter } } }, first: 1) {
        edges {
          node {
            id
            name {
              firstName
              lastName
            }
            emails {
              primaryEmail
            }
          }
        }
      }
    }
  `;
  const result = await graphql(query, { emailFilter: email });
  if (!result.success) return result;

  const person = result.data?.people?.edges?.[0]?.node;
  return { success: true, data: person || null };
}

export async function logPersonEvent(personId, type, message) {
  const createNote = /* GraphQL */ `
    mutation CreateNote($title: String!, $body: String!) {
      createNote(data: { title: $title, bodyV2: { markdown: $body } }) {
        id
      }
    }
  `;
  const noteResult = await graphql(createNote, {
    title: `Email ${type}`,
    body: message,
  });
  if (!noteResult.success || !noteResult.data?.createNote?.id) {
    return noteResult;
  }

  const noteId = noteResult.data.createNote.id;
  const linkNote = /* GraphQL */ `
    mutation LinkNote($noteId: ID!, $targetPersonId: ID!) {
      createNoteTarget(data: { noteId: $noteId, targetPersonId: $targetPersonId }) {
        id
      }
    }
  `;
  const linkResult = await graphql(linkNote, { noteId, targetPersonId: personId });
  return { success: noteResult.success, data: { noteId, linked: linkResult.success } };
}

export async function upsertSuppression(email, reason, campaignId) {
  if (!config.twenty.suppressionObject) {
    return { success: false, error: 'No suppression object configured' };
  }

  const objectName = config.twenty.suppressionObject;
  const capName = objectName.charAt(0).toUpperCase() + objectName.slice(1);

  const findQuery = /* GraphQL */ `
    query FindSuppression($email: String!) {
      ${objectName}s(filter: { email: { eq: $email } }, first: 1) {
        edges {
          node {
            id
          }
        }
      }
    }
  `;
  const existing = await graphql(findQuery, { email });
  const existingId = existing.success ? existing.data?.[`${objectName}s`]?.edges?.[0]?.node?.id : null;

  if (existingId) {
    const updateMutation = /* GraphQL */ `
      mutation UpdateSuppression($id: ID!, $reason: String!, $campaignId: String) {
        update${capName}(data: { id: $id, reason: $reason, campaignId: $campaignId }) {
          id
        }
      }
    `;
    return await graphql(updateMutation, { id: existingId, reason, campaignId: campaignId || '' });
  }

  const createMutation = /* GraphQL */ `
    mutation CreateSuppression($email: String!, $reason: String!, $campaignId: String) {
      create${capName}(data: { email: $email, reason: $reason, campaignId: $campaignId }) {
        id
      }
    }
  `;
  return await graphql(createMutation, { email, reason, campaignId: campaignId || '' });
}

export async function syncEventToTwenty(email, eventType, campaignId) {
  const results = {};

  const person = await findPersonByEmail(email);
  results.findPerson = person;

  if (!person.success) {
    console.warn(`[twenty-sync] findPerson failed for ${email}: ${person.error}`);
  }

  if (person.success && person.data?.id) {
    const logResult = await logPersonEvent(
      person.data.id,
      eventType,
      `Campaign: ${campaignId || 'N/A'} — Event: ${eventType}`,
    );
    results.logEvent = logResult;
    if (!logResult.success) {
      console.warn(`[twenty-sync] logEvent failed for ${eventType}: ${logResult.error}`);
    }
  }

  if (['bounced', 'complained', 'unsubscribed'].includes(eventType)) {
    results.suppression = await upsertSuppression(email, eventType, campaignId);
    if (!results.suppression.success) {
      console.warn(`[twenty-sync] suppression failed for ${email}: ${results.suppression.error}`);
    }
  }

  return results;
}