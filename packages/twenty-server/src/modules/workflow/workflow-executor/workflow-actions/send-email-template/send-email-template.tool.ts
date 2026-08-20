import { Injectable, Logger } from '@nestjs/common';

import { z } from 'zod';

import { isValidUuid } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { type ToolExecutionContext } from 'src/engine/core-modules/tool/types/tool-execution-context.type';
import { type Tool } from 'src/engine/core-modules/tool/types/tool.type';
import { type WorkflowSendEmailTemplateActionInput } from 'src/modules/workflow/workflow-executor/workflow-actions/send-email-template/types/workflow-send-email-template-action-input.type';

export const workflowSendEmailTemplateInputSchema = z.object({
  templateId: z.string(),
  recipients: z.object({
    to: z.string(),
    cc: z.string().optional(),
    bcc: z.string().optional(),
  }),
  subject: z.string().optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
});

@Injectable()
export class SendEmailTemplateTool implements Tool {
  private readonly logger = new Logger(SendEmailTemplateTool.name);

  description =
    'Send an email based on a saved Email Template record through the Resend bridge.';
  inputSchema = workflowSendEmailTemplateInputSchema;

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async execute(
    parameters: WorkflowSendEmailTemplateActionInput,
    context: ToolExecutionContext,
  ): Promise<ToolOutput> {
    const bridgeUrl =
      process.env.EMAIL_TEMPLATE_BRIDGE_URL || 'http://resend-bridge:3100/api/send';
    const bridgeApiKey =
      process.env.EMAIL_TEMPLATE_BRIDGE_API_KEY || '';

    if (!bridgeApiKey) {
      return {
        success: false,
        message: 'Failed to send email',
        error: 'EMAIL_TEMPLATE_BRIDGE_API_KEY is not configured',
      };
    }

    if (!isValidUuid(parameters.templateId)) {
      return {
        success: false,
        message: 'Failed to send email',
        error: `Invalid templateId: ${parameters.templateId}`,
      };
    }

    let template: {
      name?: string;
      subject?: string;
      html?: string;
      css?: string;
    } | null = null;

    try {
      const repository = await this.globalWorkspaceOrmManager.getRepository(
        context.workspaceId,
        'emailTemplate',
      );

      const row = await repository.findOne({
        where: { id: parameters.templateId },
      });

      template = row as {
        name?: string;
        subject?: string;
        html?: string;
        css?: string;
      } | null;
    } catch (error) {
      this.logger.error(`Failed to load email template: ${error}`);

      return {
        success: false,
        message: 'Failed to send email',
        error: 'Failed to load the email template from the workspace',
      };
    }

    if (!template || !template.html) {
      return {
        success: false,
        message: 'Failed to send email',
        error: `Email template not found or has no content: ${parameters.templateId}`,
      };
    }

    const variables = parameters.variables ?? {};
    const html = this.applyVariables(template.html, variables);
    const subject =
      parameters.subject || this.applyVariables(template.subject || '', variables);

    try {
      const response = await fetch(bridgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bridgeApiKey}`,
        },
        body: JSON.stringify({
          to: parameters.recipients.to,
          ...(parameters.recipients.cc
            ? { cc: parameters.recipients.cc }
            : {}),
          ...(parameters.recipients.bcc
            ? { bcc: parameters.recipients.bcc }
            : {}),
          subject,
          html,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: 'Failed to send email',
          error: body.error ?? `Bridge responded with HTTP ${response.status}`,
          status: response.status,
        };
      }

      return {
        success: true,
        message: `Email "${template.name ?? ''}" sent to ${parameters.recipients.to}`,
        result: {
          templateId: parameters.templateId,
          templateName: template.name,
          recipients: parameters.recipients.to,
          messageId: body.messageId,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to send email via bridge: ${error}`);

      return {
        success: false,
        message: 'Failed to send email',
        error:
          error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }

  private applyVariables(
    value: string,
    variables: Record<string, unknown>,
  ): string {
    return value.replace(/\{\{([^{}]+)\}\}/g, (_, name: string) => {
      const key = name.trim();

      return key in variables ? String(variables[key]) : `{{${name}}}`;
    });
  }
}