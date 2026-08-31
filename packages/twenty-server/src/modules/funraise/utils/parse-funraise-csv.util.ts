// Minimal, dependency-free CSV parser for the Funraise import endpoint.
// Handles quoted fields, escaped quotes, and CRLF line endings.

export const parseCsv = (input: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    const next = input[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') index++;

      row.push(field);
      field = '';

      if (row.some((cell) => cell.trim() !== '')) {
        rows.push(row);
      }

      row = [];
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);

    if (row.some((cell) => cell.trim() !== '')) {
      rows.push(row);
    }
  }

  return rows;
};

export const csvRowsToObjects = (
  rows: string[][],
): Record<string, string>[] => {
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());

  return rows.slice(1).map((row) => {
    const object: Record<string, string> = {};

    headers.forEach((header, index) => {
      object[header] = (row[index] ?? '').trim();
    });

    return object;
  });
};

const normalizeHeader = (header: string): string =>
  header.toLowerCase().replace(/[^a-z0-9]/g, '');

const pick = (
  row: Record<string, string>,
  candidates: string[],
): string => {
  for (const [key, value] of Object.entries(row)) {
    if (candidates.includes(normalizeHeader(key)) && value !== '') {
      return value;
    }
  }

  return '';
};

export const parseAmountMicros = (value: string): number => {
  const cleaned = value.replace(/[^0-9.\-]/g, '');
  const parsed = Number.parseFloat(cleaned);

  if (Number.isNaN(parsed)) return 0;

  return Math.round(parsed * 1_000_000);
};

export const parseDonationDate = (value: string): number => {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) return Date.now();

  return parsed;
};

// Maps a raw CSV row (keyed by header) into the FunraiseTransactionData shape
// our processing pipeline expects. Headers are matched case-insensitively and
// tolerantly so it works with most Funraise report exports.
export const mapCsvRowToTransaction = (
  row: Record<string, string>,
): Record<string, unknown> => {
  const firstName = pick(row, ['firstname', 'supporterfirstname', 'donorfirstname', 'first']);
  const lastName = pick(row, ['lastname', 'supporterlastname', 'donorlastname', 'last']);
  const email = pick(row, ['email', 'supporteremail', 'donoremail', 'emailaddress']);
  const amount = pick(row, ['amount', 'transactionamount', 'donationamount', 'total']);
  const currency = pick(row, ['currency', 'currencycode']) || 'USD';
  const donationDate = pick(row, ['donationdate', 'date', 'transactiondate', 'createdat']);
  const funraiseId = pick(row, ['id', 'transactionid', 'funraiseid', 'donationid']);
  const status = pick(row, ['status', 'transactionstatus']) || 'Complete';
  const cardType = pick(row, ['cardtype', 'cardbrand']);
  const lastFour = pick(row, ['lastfour', 'cardlast4', 'last4']);
  const paymentMethod = pick(row, ['paymentmethod', 'method']);
  const companyName = pick(row, ['company', 'companyname', 'employer', 'organization']);
  const description = pick(row, ['description', 'name']);

  const supporterId = Number.parseInt(
    pick(row, ['supporterid', 'donorid', 'contactid']) || '0',
    10,
  );

  const transactionId = Number.parseInt(
    funraiseId || '0',
    10,
  );

  return {
    id: transactionId || supporterId || Math.floor(Math.random() * 1e9),
    description:
      description || `${firstName} ${lastName}`.trim() || email || null,
    anonymous: false,
    imported: true,
    offline: false,
    donationDate: parseDonationDate(donationDate),
    comment: null,
    transaction: {
      amount: Number.parseFloat(amount.replace(/[^0-9.\-]/g, '')) || 0,
      currency,
      status,
      cardType: cardType || null,
      lastFour: lastFour || null,
      paymentMethod: paymentMethod || null,
      gatewayType: null,
      transactionId: funraiseId || null,
      errors: null,
    },
    dedication: null,
    companyMatch: companyName ? { companyName, companyId: null, employeeEmail: null } : null,
    subscription: null,
    allocation: null,
    form: null,
    campaignPage: null,
    softCreditSupporter: null,
    supporter: {
      id: supporterId,
      firstName: firstName || null,
      lastName: lastName || null,
      name: `${firstName} ${lastName}`.trim() || email || null,
      email: email || null,
    },
    household: null,
    pledge: null,
    tip: null,
    utm: null,
  };
};
