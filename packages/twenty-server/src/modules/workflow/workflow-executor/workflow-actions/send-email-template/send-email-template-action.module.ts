import { Module } from '@nestjs/common';

import { AuthModule } from 'src/engine/core-modules/auth/auth.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { EmailTemplateBlastController } from 'src/modules/workflow/workflow-executor/workflow-actions/send-email-template/email-template-blast.controller';
import { SendEmailTemplateTool } from 'src/modules/workflow/workflow-executor/workflow-actions/send-email-template/send-email-template.tool';
import { SendEmailTemplateWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/send-email-template/send-email-template.workflow-action';
import { WorkflowRunModule } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run.module';

@Module({
  imports: [AuthModule, WorkspaceCacheStorageModule, WorkflowRunModule],
  controllers: [EmailTemplateBlastController],
  providers: [SendEmailTemplateTool, SendEmailTemplateWorkflowAction],
  exports: [SendEmailTemplateTool, SendEmailTemplateWorkflowAction],
})
export class SendEmailTemplateActionModule {}