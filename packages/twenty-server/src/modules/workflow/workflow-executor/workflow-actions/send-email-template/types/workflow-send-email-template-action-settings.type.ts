import { type BaseWorkflowActionSettings } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action-settings.type';
import { type WorkflowSendEmailTemplateActionInput } from 'src/modules/workflow/workflow-executor/workflow-actions/send-email-template/types/workflow-send-email-template-action-input.type';

export type WorkflowSendEmailTemplateActionSettings =
  BaseWorkflowActionSettings & {
    input: WorkflowSendEmailTemplateActionInput;
  };