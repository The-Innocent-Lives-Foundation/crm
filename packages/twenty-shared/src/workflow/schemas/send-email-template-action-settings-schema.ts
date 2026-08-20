import { z } from 'zod';
import { baseWorkflowActionSettingsSchema } from './base-workflow-action-settings-schema';

export const workflowSendEmailTemplateActionSettingsSchema =
  baseWorkflowActionSettingsSchema.extend({
    input: z.object({
      templateId: z
        .string()
        .describe(
          'ID of the emailTemplate record to send, or a {{variable}} reference to one',
        ),
      recipients: z.object({
        to: z.string().optional().default(''),
        cc: z.string().optional().default(''),
        bcc: z.string().optional().default(''),
      }),
      subject: z
        .string()
        .optional()
        .describe('Override the subject line, supports {{variables}}'),
      variables: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'Values to substitute into {{placeholders}} inside the template',
        ),
    }),
  });