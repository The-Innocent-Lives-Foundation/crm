import 'dotenv/config';

/**
 * Centralised configuration — every value is read from the environment
 * so the service is fully stateless and 12-factor compliant.
 */
export const config = {
  port: parseInt(process.env.PORT || '3100', 10),

  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.RESEND_FROM_EMAIL || 'notifications@yourdomain.com',
    fromName: process.env.RESEND_FROM_NAME || '',
    audienceId: process.env.RESEND_AUDIENCE_ID || '',
  },

  bridge: {
    apiKey: process.env.BRIDGE_API_KEY || 'change-me-to-a-long-random-string',
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3100').replace(/\/$/, ''),
    rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '120', 10),
  },

  twenty: {
    apiUrl: process.env.TWENTY_API_URL || 'http://server:3000/graphql',
    apiKey: process.env.TWENTY_API_KEY || '',
    suppressionObject: process.env.TWENTY_SUPPRESSION_OBJECT || 'emailSuppression',
  },

  webhook: {
    secret: process.env.RESEND_WEBHOOK_SECRET || '',
  },
};

/** Validate critical config at startup so we fail fast. */
export function validateConfig() {
  const errors = [];
  if (!config.resend.apiKey || config.resend.apiKey.startsWith('re_xxxxx')) {
    errors.push('RESEND_API_KEY is not set — sending will be disabled');
  }
  if (config.bridge.apiKey === 'change-me-to-a-long-random-string') {
    errors.push('BRIDGE_API_KEY is still the default — change it before production use');
  }
  if (!config.bridge.apiKey) {
    errors.push('BRIDGE_API_KEY is not set');
  }
  if (!config.webhook.secret) {
    errors.push('RESEND_WEBHOOK_SECRET not set — webhooks will not be verified');
  }
  return errors;
}
