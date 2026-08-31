import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { isValidUuid } from 'twenty-shared/utils';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';

type EmailTemplateRow = {
  id: string;
  name?: string;
  subject?: string;
  html?: string;
};

type BlastRequestBody = {
  templateId?: string;
  subject?: string;
  campaignId?: string;
  source?: 'messageList' | 'company' | 'selected';
  messageListId?: string;
  companyId?: string;
  personIds?: string[];
};

const bridgeSendUrl =
  process.env.EMAIL_TEMPLATE_BRIDGE_URL || 'http://resend-bridge:3100/api/send';
const bridgeApiKey = process.env.EMAIL_TEMPLATE_BRIDGE_API_KEY || '';
const bridgeBaseUrl = bridgeSendUrl.replace(/\/api\/send\/?$/, '');

@Controller('rest/email-blast')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
export class EmailTemplateBlastController {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  @Post('preview')
  async preview(@Body() body: BlastRequestBody) {
    this.assertBridgeConfigured();

    const response = await fetch(`${bridgeBaseUrl}/api/blast/preview`, {
      method: 'POST',
      headers: this.bridgeHeaders(),
      body: JSON.stringify(this.audiencePayload(body)),
    });

    return this.parseBridge(response);
  }

  @Post()
  async send(@Body() body: BlastRequestBody) {
    this.assertBridgeConfigured();

    if (!isNonEmptyString(body.templateId) || !isValidUuid(body.templateId)) {
      throw new BadRequestException('templateId is required');
    }

    const authContext = getWorkspaceAuthContext();
    const repository = await this.globalWorkspaceOrmManager.getRepository(
      authContext.workspace.id,
      'emailTemplate',
    );
    const template = (await repository.findOne({
      where: { id: body.templateId },
    })) as EmailTemplateRow | null;

    if (!template?.html) {
      throw new BadRequestException(
        'Email template not found or has no content',
      );
    }

    const subject = isNonEmptyString(body.subject)
      ? body.subject
      : template.subject;

    if (!isNonEmptyString(subject)) {
      throw new BadRequestException('subject is required');
    }

    const response = await fetch(`${bridgeBaseUrl}/api/blast`, {
      method: 'POST',
      headers: this.bridgeHeaders(),
      body: JSON.stringify({
        html: template.html,
        subject,
        campaignId: body.campaignId,
        ...this.audiencePayload(body),
      }),
    });

    return this.parseBridge(response);
  }

  @Get(':id')
  async status(@Param('id') id: string) {
    this.assertBridgeConfigured();

    const response = await fetch(`${bridgeBaseUrl}/api/blast/${id}`, {
      headers: this.bridgeHeaders(),
    });

    return this.parseBridge(response);
  }

  private audiencePayload(body: BlastRequestBody) {
    return {
      source: body.source,
      messageListId: body.messageListId,
      companyId: body.companyId,
      personIds: body.personIds ?? [],
    };
  }

  private assertBridgeConfigured() {
    if (!bridgeApiKey) {
      throw new BadRequestException(
        'EMAIL_TEMPLATE_BRIDGE_API_KEY is not configured',
      );
    }
  }

  private bridgeHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bridgeApiKey}`,
    };
  }

  private async parseBridge(response: Response) {
    const payload = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      throw new BadRequestException(
        (payload.error as string) || `Bridge HTTP ${response.status}`,
      );
    }

    return payload;
  }
}
