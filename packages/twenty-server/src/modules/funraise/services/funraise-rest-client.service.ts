import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import {
  FUNRAISE_API_VERSION_PATH,
  FUNRAISE_DEFAULT_API_BASE_URL,
} from 'src/modules/funraise/constants/funraise.constants';
import {
  FunraiseException,
  FunraiseExceptionCode,
} from 'src/modules/funraise/exceptions/funraise.exception';
import { type FunraiseTransactionData } from 'src/modules/funraise/types/funraise-webhook-payload.type';

// Funraise authenticates REST requests with the API key in the X-Api-Key header
// (not Bearer / SigV4). See the "Authentication" section of the Funraise API docs.
const FUNRAISE_API_KEY_HEADER = 'X-Api-Key';

@Injectable()
export class FunraiseRestClientService {
  private readonly logger = new Logger(FunraiseRestClientService.name);

  constructor(
    private readonly secureHttpClientService: SecureHttpClientService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  async listTransactions(
    workspaceId: string,
    params: { since?: Date; cursor?: string } = {},
  ): Promise<FunraiseTransactionData[]> {
    return this.get<FunraiseTransactionData[]>('/transactions', workspaceId, {
      ...(isDefined(params.since) && {
        updated_after: params.since.toISOString(),
      }),
      ...(isDefined(params.cursor) && { cursor: params.cursor }),
    });
  }

  async getTransaction(
    funraiseTransactionId: number,
    workspaceId: string,
  ): Promise<FunraiseTransactionData> {
    return this.get<FunraiseTransactionData>(
      `/transactions/${funraiseTransactionId}`,
      workspaceId,
    );
  }

  private async get<T>(
    path: string,
    workspaceId: string,
    params?: Record<string, string>,
  ): Promise<T> {
    const apiKey = this.twentyConfigService.get('FUNRAISE_API_KEY');
    const baseUrl =
      this.twentyConfigService.get('FUNRAISE_API_BASE_URL') ??
      FUNRAISE_DEFAULT_API_BASE_URL;

    if (!isDefined(apiKey)) {
      throw new FunraiseException(
        'FUNRAISE_API_KEY is not configured',
        FunraiseExceptionCode.MISSING_CONFIGURATION,
      );
    }

    const versionPath = FUNRAISE_API_VERSION_PATH;

    const client = this.secureHttpClientService.getHttpClient(
      {
        baseURL: baseUrl,
        headers: { [FUNRAISE_API_KEY_HEADER]: apiKey },
      },
      { workspaceId, source: 'funraise-backfill' },
    );

    try {
      const response = await client.get<T>(`${versionPath}${path}`, {
        params,
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Funraise API request failed: ${path}`, error);

      throw new FunraiseException(
        `Funraise API request failed: ${path}`,
        FunraiseExceptionCode.REST_REQUEST_FAILED,
      );
    }
  }
}
