import { assertUnreachable } from 'twenty-shared/utils';

import {
  FunraiseException,
  FunraiseExceptionCode,
} from 'src/modules/funraise/exceptions/funraise.exception';

export const getFunraiseExceptionStatusCode = (
  exception: FunraiseException,
): 400 | 500 => {
  switch (exception.code) {
    case FunraiseExceptionCode.MISSING_CONFIGURATION:
    case FunraiseExceptionCode.MISSING_REQUEST_BODY:
    case FunraiseExceptionCode.INVALID_WEBHOOK_PAYLOAD:
      return 400;
    case FunraiseExceptionCode.REST_REQUEST_FAILED:
      return 500;
    default:
      return assertUnreachable(exception.code);
  }
};
