import { Injectable } from '@nestjs/common';

import { type WorkflowRunStepLog } from 'twenty-shared/workflow';

import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { type Tool } from 'src/engine/core-modules/tool/types/tool.type';
import {
  WorkflowStepExecutorException,
  WorkflowStepExecutorExceptionCode,
} from 'src/modules/workflow/workflow-executor/exceptions/workflow-step-executor.exception';
import { SendEmailTemplateTool } from 'src/modules/workflow/workflow-executor/workflow-actions/send-email-template/send-email-template.tool';
import { isWorkflowSendEmailTemplateAction } from 'src/modules/workflow/workflow-executor/workflow-actions/send-email-template/guards/is-workflow-send-email-template-action.guard';
import { ToolBackedWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/tool-backed/tool-backed.workflow-action';
import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';
import { WorkflowRunStepLogWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run-step-log.workspace-service';

@Injectable()
export class SendEmailTemplateWorkflowAction extends ToolBackedWorkflowAction<{
  templateId: string;
  recipients: { to: string; cc?: string; bcc?: string };
  subject?: string;
  variables?: Record<string, unknown>;
}> {
  constructor(
    private readonly sendEmailTemplateTool: SendEmailTemplateTool,
    workflowRunStepLogService: WorkflowRunStepLogWorkspaceService,
  ) {
    super(SendEmailTemplateWorkflowAction.name, workflowRunStepLogService);
  }

  protected getTool(): Tool {
    return this.sendEmailTemplateTool;
  }

  protected assertStep(step: WorkflowAction): void {
    if (!isWorkflowSendEmailTemplateAction(step)) {
      throw new WorkflowStepExecutorException(
        'Step is not a send-email-template action',
        WorkflowStepExecutorExceptionCode.INVALID_STEP_TYPE,
      );
    }
  }

  protected buildStepLog({
    input,
    output,
    durationMs,
  }: {
    input: {
      templateId: string;
      recipients: { to: string; cc?: string; bcc?: string };
      subject?: string;
    };
    output: ToolOutput;
    durationMs: number;
  }): WorkflowRunStepLog {
    return {
      details: {
        type: 'EMAIL',
        mode: 'SEND',
        status: output.success ? 'SUCCESS' : 'ERROR',
        recipients: {
          to: input.recipients?.to ? [input.recipients.to] : [],
          cc:
            input.recipients?.cc && input.recipients.cc.length > 0
              ? [input.recipients.cc]
              : undefined,
          bcc:
            input.recipients?.bcc && input.recipients.bcc.length > 0
              ? [input.recipients.bcc]
              : undefined,
        },
        subject: input.subject,
        error: output.error,
        durationMs,
      },
      entries: [],
      sizeBytes: 0,
    };
  }
}