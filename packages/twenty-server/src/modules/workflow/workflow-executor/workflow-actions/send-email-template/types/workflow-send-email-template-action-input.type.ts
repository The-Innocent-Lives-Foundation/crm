export type WorkflowSendEmailTemplateActionInput = {
  templateId: string;
  recipients: {
    to: string;
    cc?: string;
    bcc?: string;
  };
  subject?: string;
  variables?: Record<string, unknown>;
};