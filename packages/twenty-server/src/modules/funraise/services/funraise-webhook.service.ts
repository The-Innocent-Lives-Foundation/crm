import { Injectable, Logger } from '@nestjs/common';

import { isDefined, parseJson } from 'twenty-shared/utils';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import {
  FUNRAISE_WEBHOOK_EVENT_DONATION,
} from 'src/modules/funraise/constants/funraise.constants';
import {
  FunraiseException,
  FunraiseExceptionCode,
} from 'src/modules/funraise/exceptions/funraise.exception';
import { FunraiseTransactionService } from 'src/modules/funraise/services/funraise-transaction.service';
import { type FunraiseWebhookPayload } from 'src/modules/funraise/types/funraise-webhook-payload.type';

@Injectable()
export class FunraiseWebhookService {
  private readonly logger = new Logger(FunraiseWebhookService.name);

  constructor(
    private readonly twentyConfigService: TwentyConfigService,
    private readonly funraiseTransactionService: FunraiseTransactionService,
  ) {}

  async handlePayload(rawBody: Buffer): Promise<void> {
    const payload = parseJson<FunraiseWebhookPayload>(
      rawBody.toString('utf8'),
    );

    if (!isDefined(payload) || !isDefined(payload.data)) {
      throw new FunraiseException(
        'Invalid Funraise webhook payload',
        FunraiseExceptionCode.INVALID_WEBHOOK_PAYLOAD,
      );
    }

    if (payload.event !== FUNRAISE_WEBHOOK_EVENT_DONATION) {
      this.logger.log(`Ignoring Funraise event "${payload.event}"`);

      return;
    }

    const workspaceId = this.getWorkspaceId();

    await this.funraiseTransactionService.processTransaction(
      payload.data,
      workspaceId,
    );
  }

  private getWorkspaceId(): string {
    const workspaceId = this.twentyConfigService.get('FUNRAISE_WORKSPACE_ID');

    if (!isDefined(workspaceId)) {
      throw new FunraiseException(
        'FUNRAISE_WORKSPACE_ID is not configured',
        FunraiseExceptionCode.MISSING_CONFIGURATION,
      );
    }

    return workspaceId;
  }
}
