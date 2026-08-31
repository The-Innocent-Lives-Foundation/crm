import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import {
  FunraiseException,
  FunraiseExceptionCode,
} from 'src/modules/funraise/exceptions/funraise.exception';
import { FunraiseRestClientService } from 'src/modules/funraise/services/funraise-rest-client.service';
import { FunraiseTransactionService } from 'src/modules/funraise/services/funraise-transaction.service';

// Backfill window: pull transactions updated within this many minutes.
const BACKFILL_WINDOW_MINUTES = 30;

@Injectable()
export class FunraiseBackfillService {
  private readonly logger = new Logger(FunraiseBackfillService.name);

  constructor(
    private readonly twentyConfigService: TwentyConfigService,
    private readonly funraiseRestClientService: FunraiseRestClientService,
    private readonly funraiseTransactionService: FunraiseTransactionService,
  ) {}

  async backfill(): Promise<void> {
    const workspaceId = this.getWorkspaceId();

    const since = new Date(
      Date.now() - BACKFILL_WINDOW_MINUTES * 60 * 1000,
    );

    const transactions =
      await this.funraiseRestClientService.listTransactions(workspaceId, {
        since,
      });

    for (const transaction of transactions) {
      try {
        await this.funraiseTransactionService.processTransaction(
          transaction,
          workspaceId,
        );
      } catch (error) {
        this.logger.error(
          `Failed to backfill Funraise transaction #${transaction.id}`,
          error,
        );
      }
    }

    this.logger.log(
      `Funraise backfill processed ${transactions.length} transactions`,
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
