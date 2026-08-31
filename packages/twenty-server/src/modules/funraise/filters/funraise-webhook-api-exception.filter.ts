import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
} from '@nestjs/common';

import { type Response } from 'express';

import { HttpExceptionHandlerService } from 'src/engine/core-modules/exception-handler/http-exception-handler.service';

import { FunraiseException } from 'src/modules/funraise/exceptions/funraise.exception';
import { getFunraiseExceptionStatusCode } from 'src/modules/funraise/utils/get-funraise-exception-status-code.util';

@Catch(FunraiseException)
export class FunraiseWebhookApiExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly httpExceptionHandlerService: HttpExceptionHandlerService,
  ) {}

  catch(exception: FunraiseException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    return this.httpExceptionHandlerService.handleError(
      exception,
      response,
      getFunraiseExceptionStatusCode(exception),
    );
  }
}
