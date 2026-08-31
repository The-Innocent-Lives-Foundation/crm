export const FUNRAISE_WEBHOOK_PATH = 'webhooks/funraise';

export const FUNRAISE_WEBHOOK_SIGNING_SECRET_HEADER = 'x-hook-secret';

export const FUNRAISE_WEBHOOK_EVENT_DONATION = 'DONATION';

export const FUNRAISE_DEFAULT_API_BASE_URL = 'https://api.funraise.io';

// Funraise API is versioned: v1 endpoints live under /api/v1, v2 under /api/v2.
export const FUNRAISE_API_VERSION_PATH = '/api/v1';

export const FUNRAISE_OPPORTUNITY_NAME_PREFIX = 'Funraise donation';

export const FUNRAISE_BACKFILL_CRON_PATTERN = '*/15 * * * *';

// Mapping of Funraise transaction status -> Twenty opportunity stage.
// Only these stages exist on the standard opportunity object: NEW, SCREENING,
// MEETING, PROPOSAL, CUSTOMER.
export const FUNRAISE_TRANSACTION_STATUS_WON = 'Complete';
