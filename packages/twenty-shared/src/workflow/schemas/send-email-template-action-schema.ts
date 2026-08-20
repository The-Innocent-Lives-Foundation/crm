import { z } from 'zod';
import { baseWorkflowActionSchema } from './base-workflow-action-schema';
import { workflowSendEmailTemplateActionSettingsSchema } from './send-email-template-action-settings-schema';

export const workflowSendEmailTemplateActionSchema =
  baseWorkflowActionSchema.extend({
    type: z.literal('SEND_EMAIL_TEMPLATE'),
    settings: workflowSendEmailTemplateActionSettingsSchema,
  });