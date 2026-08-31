import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  type RawBodyRequest,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { type Response } from 'express';

import { isDefined } from 'twenty-shared/utils';

import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';

import { FUNRAISE_WEBHOOK_PATH, FUNRAISE_WEBHOOK_SIGNING_SECRET_HEADER } from 'src/modules/funraise/constants/funraise.constants';
import { FunraiseException, FunraiseExceptionCode } from 'src/modules/funraise/exceptions/funraise.exception';
import { FunraiseEventStoreService } from 'src/modules/funraise/services/funraise-event-store.service';
import { FunraiseTransactionService } from 'src/modules/funraise/services/funraise-transaction.service';
import { FunraiseWebhookService } from 'src/modules/funraise/services/funraise-webhook.service';
import { FunraiseWebhookApiExceptionFilter } from 'src/modules/funraise/filters/funraise-webhook-api-exception.filter';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { type FunraiseTransactionData } from 'src/modules/funraise/types/funraise-webhook-payload.type';
import {
  csvRowsToObjects,
  mapCsvRowToTransaction,
  parseCsv,
} from 'src/modules/funraise/utils/parse-funraise-csv.util';

const FUNRAISE_REPLAY_PATH = 'webhooks/funraise/replay';
const FUNRAISE_IMPORT_PATH = 'webhooks/funraise/import';
const FUNRAISE_CSV_IMPORT_PATH = 'webhooks/funraise/csv-import';

@Controller()
@UseFilters(FunraiseWebhookApiExceptionFilter)
export class FunraiseWebhookController {
  constructor(
    private readonly funraiseWebhookService: FunraiseWebhookService,
    private readonly funraiseEventStoreService: FunraiseEventStoreService,
    private readonly funraiseTransactionService: FunraiseTransactionService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  @Post([FUNRAISE_WEBHOOK_PATH])
  @UseGuards(PublicEndpointGuard, NoPermissionGuard)
  @HttpCode(200)
  async handleWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Res() response: Response,
    @Headers(FUNRAISE_WEBHOOK_SIGNING_SECRET_HEADER)
    hookSecret?: string,
  ): Promise<void> {
    // Funraise subscription handshake: echo the secret back.
    if (isDefined(hookSecret)) {
      response.setHeader(FUNRAISE_WEBHOOK_SIGNING_SECRET_HEADER, hookSecret);
    }

    // Pure handshake (no body) or missing payload: acknowledge and stop.
    if (!isDefined(request.rawBody)) {
      response.status(200).send();

      return;
    }

    await this.funraiseWebhookService.handlePayload(request.rawBody);

    response.status(200).send();
  }

  // Replay stored events within an optional date range. Useful for backfilling
  // after a temporary outage or for testing.
  @Post([FUNRAISE_REPLAY_PATH])
  @UseGuards(PublicEndpointGuard, NoPermissionGuard)
  @HttpCode(200)
  async replayStoredEvents(
    @Res() response: Response,
    @Query('since') sinceParam?: string,
  ): Promise<void> {
    const since = isDefined(sinceParam) ? new Date(sinceParam) : undefined;
    const events = this.funraiseEventStoreService.loadEvents(since);

    const workspaceId = this.getWorkspaceId();

    const results: { funraiseId: number; status: string; error?: string }[] =
      [];

    for (const { event } of events) {
      try {
        await this.funraiseTransactionService.processTransaction(
          event.payload,
          workspaceId,
        );
        results.push({ funraiseId: event.funraiseId, status: 'replayed' });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);

        results.push({
          funraiseId: event.funraiseId,
          status: 'failed',
          error: message,
        });
      }
    }

    response.status(200).json({
      replayed: results.filter((r) => r.status === 'replayed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      total: events.length,
      results,
    });
  }

  // Import Funraise transactions from a JSON array (e.g. exported from a CSV,
  // report, or backfill script). Each object must match FunraiseTransactionData.
  @Post([FUNRAISE_CSV_IMPORT_PATH])
  @UseGuards(PublicEndpointGuard, NoPermissionGuard)
  @HttpCode(200)
  async importTransactions(
    @Body() body: unknown,
    @Res() response: Response,
  ): Promise<void> {
    if (!isDefined(body)) {
      throw new FunraiseException(
        'Missing import payload',
        FunraiseExceptionCode.MISSING_REQUEST_BODY,
      );
    }

    let transactions: FunraiseTransactionData[];

    if (Array.isArray(body)) {
      transactions = body as FunraiseTransactionData[];
    } else if (typeof body === 'object' && Array.isArray((body as Record<string, unknown>).transactions)) {
      transactions = (body as Record<string, FunraiseTransactionData[]>).transactions;
    } else {
      throw new FunraiseException(
        'Invalid import payload: expected JSON array or { transactions: [...] }',
        FunraiseExceptionCode.INVALID_WEBHOOK_PAYLOAD,
      );
    }

    const workspaceId = this.getWorkspaceId();
    let success = 0;
    let failed = 0;

    for (const transaction of transactions) {
      try {
        await this.funraiseTransactionService.processTransaction(
          transaction,
          workspaceId,
        );
        success++;
      } catch (err) {
        failed++;
      }
    }

    response.status(200).json({ success, failed, total: transactions.length });
  }

  // Import raw CSV (text/csv or text/plain) exported from Funraise reports.
  // Headers are mapped case-insensitively to the transaction shape.
  @Post([FUNRAISE_IMPORT_PATH])
  @UseGuards(PublicEndpointGuard, NoPermissionGuard)
  @HttpCode(200)
  async importCsv(
    @Req() request: RawBodyRequest<Request>,
    @Res() response: Response,
  ): Promise<void> {
    if (!isDefined(request.rawBody)) {
      throw new FunraiseException(
        'Missing CSV payload',
        FunraiseExceptionCode.MISSING_REQUEST_BODY,
      );
    }

    const rows = parseCsv(request.rawBody.toString('utf8'));

    if (rows.length === 0) {
      throw new FunraiseException(
        'Empty CSV payload',
        FunraiseExceptionCode.INVALID_WEBHOOK_PAYLOAD,
      );
    }

    const objects = csvRowsToObjects(rows);
    const transactions = objects.map(mapCsvRowToTransaction) as unknown as FunraiseTransactionData[];

    const workspaceId = this.getWorkspaceId();
    let success = 0;
    let failed = 0;

    for (const transaction of transactions) {
      try {
        await this.funraiseTransactionService.processTransaction(
          transaction,
          workspaceId,
        );
        success++;
      } catch (err) {
        failed++;
      }
    }

    response
      .status(200)
      .json({ success, failed, total: transactions.length });
  }

  @Get([FUNRAISE_REPLAY_PATH])
  @UseGuards(PublicEndpointGuard, NoPermissionGuard)
  async getEventCount(@Res() response: Response): Promise<void> {
    const events = this.funraiseEventStoreService.loadEvents();

    response.status(200).json({ total: events.length });
  }

  private getWorkspaceId(): string {
    const workspaceId =
      this.twentyConfigService.get('FUNRAISE_WORKSPACE_ID');

    if (!isDefined(workspaceId)) {
      throw new FunraiseException(
        'FUNRAISE_WORKSPACE_ID is not configured',
        FunraiseExceptionCode.MISSING_CONFIGURATION,
      );
    }

    return workspaceId;
  }
}
