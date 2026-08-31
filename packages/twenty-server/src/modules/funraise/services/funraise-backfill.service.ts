import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import {
  FunraiseException,
  FunraiseExceptionCode,
} from 'src/modules/funraise/exceptions/funraise.exception';
import { FunraiseEventStoreService } from 'src/modules/funraise/services/funraise-event-store.service';
import { FunraiseRestClientService } from 'src/modules/funraise/services/funraise-rest-client.service';
import { FunraiseTransactionService } from 'src/modules/funraise/services/funraise-transaction.service';

// Window: replay events received within this many hours.
// Events older than this are already in CRM and idempotency avoids duplicates.
const BACKFILL_WINDOW_HOURS = 24;

@Injectable()
export class FunraiseBackfillService {
  private readonly logger = new Logger(FunraiseBackfillService.name);

  constructor(
    private readonly twentyConfigService: TwentyConfigService,
    private readonly funraiseRestClientService: FunraiseRestClientService,
    private readonly funraiseTransactionService: FunraiseTransactionService,
    private readonly funraiseEventStoreService: FunraiseEventStoreService,
  ) {}

  async backfill(): Promise<void> {
    const workspaceId = this.getWorkspaceId();

    // Primary path: replay stored webhook events (always works).
    // Secondary path: attempt Funraise REST pull (currently non-functional;
    // the FW API Gateway rejects all requests. Kept here so it auto-activates
    // once Funraise fixes their authorizer configuration.)
    const replayed = await this.replayStoredEvents(workspaceId);
    const pulled = await this.tryPullFromRest(workspaceId);

    this.logger.log(
      `Funraise backfill: replayed=${replayed} pulled=${pulled}`,
    );
  }

  private async replayStoredEvents(workspaceId: string): Promise<number> {
    const since = new Date(
      Date.now() - BACKFILL_WINDOW_HOURS * 3600 * 1000,
    );
    const events = this.funraiseEventStoreService.loadEvents(since);

    let count = 0;

    for (const { event } of events) {
      try {
        await this.funraiseTransactionService.processTransaction(
          event.payload,
          workspaceId,
        );
        count++;
      } catch (err) {
        this.logger.error(
          `Backfill replay failed for Funraise #${event.funraiseId}`,
          err,
        );
      }
    }

    return count;
  }

  private async tryPullFromRest(workspaceId: string): Promise<number> {
    try {
      const transactions =
        await this.funraiseRestClientService.listTransactions(workspaceId, {
          since: new Date(
            Date.now() - BACKFILL_WINDOW_HOURS * 3600 * 1000,
          ),
        });

      let count = 0;

      for (const transaction of transactions) {
        try {
          await this.funraiseTransactionService.processTransaction(
            transaction,
            workspaceId,
          );
          count++;
        } catch (err) {
          this.logger.error(
            `REST backfill failed for Funraise #${transaction.id}`,
            err,
          );
        }
      }

      return count;
    } catch {
      this.logger.warn(
        'Funraise REST API unavailable (expected: API gateway rejecting all requests). Backfill replay-only.',
      );

      return 0;
    }
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