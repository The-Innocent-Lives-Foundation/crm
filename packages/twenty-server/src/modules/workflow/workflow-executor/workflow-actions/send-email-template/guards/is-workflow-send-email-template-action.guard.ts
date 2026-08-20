import { WorkflowActionType } from 'twenty-shared/workflow';

import { type WorkflowSendEmailTemplateAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';

export const isWorkflowSendEmailTemplateAction = (
  action: WorkflowSendEmailTemplateAction,
): action is WorkflowSendEmailTemplateAction => {
  return action.type === WorkflowActionType.SEND_EMAIL_TEMPLATE;
};