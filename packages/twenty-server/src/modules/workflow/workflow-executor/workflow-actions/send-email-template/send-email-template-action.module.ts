import { Module } from '@nestjs/common';

import { SendEmailTemplateTool } from 'src/modules/workflow/workflow-executor/workflow-actions/send-email-template/send-email-template.tool';
import { SendEmailTemplateWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/send-email-template/send-email-template.workflow-action';
import { WorkflowRunModule } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run.module';

@Module({
  imports: [WorkflowRunModule],
  providers: [SendEmailTemplateTool, SendEmailTemplateWorkflowAction],
  exports: [SendEmailTemplateTool, SendEmailTemplateWorkflowAction],
})
export class SendEmailTemplateActionModule {}