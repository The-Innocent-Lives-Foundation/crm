import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const SEND_EMAIL_TEMPLATE_ACTION: {
  defaultLabel: string;
  type: Extract<WorkflowActionType, 'SEND_EMAIL_TEMPLATE'>;
  icon: string;
} = {
  defaultLabel: 'Send Email Template',
  type: 'SEND_EMAIL_TEMPLATE',
  icon: 'IconSend',
};