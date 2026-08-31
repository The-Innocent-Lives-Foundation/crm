import {
  Controller,
  Headers,
  HttpCode,
  Post,
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
import {
  FunraiseException,
  FunraiseExceptionCode,
} from 'src/modules/funraise/exceptions/funraise.exception';
import { FunraiseWebhookService } from 'src/modules/funraise/services/funraise-webhook.service';
import { FunraiseWebhookApiExceptionFilter } from 'src/modules/funraise/filters/funraise-webhook-api-exception.filter';

@Controller()
@UseFilters(FunraiseWebhookApiExceptionFilter)
export class FunraiseWebhookController {
  constructor(
    private readonly funraiseWebhookService: FunraiseWebhookService,
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
    if (isDefined(hookSecret)) {
      // Funraise subscription handshake: echo the secret back.
      response.setHeader(FUNRAISE_WEBHOOK_SIGNING_SECRET_HEADER, hookSecret);
      response.status(200).send();

      return;
    }

    if (!isDefined(request.rawBody)) {
      throw new FunraiseException(
        'Missing Funraise webhook body',
        FunraiseExceptionCode.MISSING_REQUEST_BODY,
      );
    }

    await this.funraiseWebhookService.handlePayload(request.rawBody);

    response.status(200).send();
  }
}
