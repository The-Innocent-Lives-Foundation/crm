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

const PERSON_FIELDS = `
  id
  name { firstName lastName }
  emails { primaryEmail }
  jobTitle
  city
  company { name }
`;

async function paginate(queryName, buildQuery, extraVars = {}) {
  const nodes = [];
  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = await graphql(
      buildQuery(),
      after ? { after, ...extraVars } : extraVars,
    );
    if (!result.success) return result;
    const connection = result.data?.[queryName];
    const edges = connection?.edges ?? [];
    for (const edge of edges) {
      if (edge?.node) nodes.push(edge.node);
    }
    hasNextPage = !!connection?.pageInfo?.hasNextPage;
    after = connection?.pageInfo?.endCursor || null;
    if (!after) hasNextPage = false;
  }

  return { success: true, data: nodes };
}

export async function listPeopleWithEmails() {
  return paginate('people', () => /* GraphQL */ `
    query ListPeople($after: String) {
      people(first: 100, after: $after) {
        edges { node { ${PERSON_FIELDS} } }
        pageInfo { hasNextPage endCursor }
      }
    }
  `);
}

export async function listPeopleByCompany(companyId) {
  return paginate(
    'people',
    () => /* GraphQL */ `
      query ListPeopleByCompany($companyId: UUID!, $after: String) {
        people(first: 100, after: $after, filter: { companyId: { eq: $companyId } }) {
          edges { node { ${PERSON_FIELDS} } }
          pageInfo { hasNextPage endCursor }
        }
      }
    `,
    { companyId },
  );
}

export async function listPeopleByIds(ids) {
  if (!ids.length) return { success: true, data: [] };
  return paginate(
    'people',
    () => /* GraphQL */ `
      query ListPeopleByIds($ids: [UUID!]!, $after: String) {
        people(first: 100, after: $after, filter: { id: { in: $ids } }) {
          edges { node { ${PERSON_FIELDS} } }
          pageInfo { hasNextPage endCursor }
        }
      }
    `,
    { ids },
  );
}

export async function listPeopleOnMessageList(listId) {
  const result = await paginate(
    'messageListMembers',
    () => /* GraphQL */ `
      query ListMembers($listId: UUID!, $after: String) {
        messageListMembers(first: 100, after: $after, filter: { listId: { eq: $listId } }) {
          edges { node { person { ${PERSON_FIELDS} } } }
          pageInfo { hasNextPage endCursor }
        }
      }
    `,
    { listId },
  );
  if (!result.success) return result;
  return {
    success: true,
    data: result.data.map((row) => row.person).filter(Boolean),
  };
}

export async function listSuppressedEmails() {
  const objectName = config.twenty.suppressionObject;
  if (!objectName) return { success: true, data: [] };

  const plural = `${objectName}s`;
  return paginate(plural, () => /* GraphQL */ `
    query ListSuppressions($after: String) {
      ${plural}(first: 100, after: $after) {
        edges { node { email } }
        pageInfo { hasNextPage endCursor }
      }
    }
  `);
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