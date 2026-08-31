import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { assertUnreachable } from 'twenty-shared/utils';

import { CustomException } from 'src/utils/custom-exception';

export enum FunraiseExceptionCode {
  MISSING_CONFIGURATION = 'FUNRAISE_MISSING_CONFIGURATION',
  MISSING_REQUEST_BODY = 'FUNRAISE_MISSING_REQUEST_BODY',
  INVALID_WEBHOOK_PAYLOAD = 'FUNRAISE_INVALID_WEBHOOK_PAYLOAD',
  REST_REQUEST_FAILED = 'FUNRAISE_REST_REQUEST_FAILED',
}

const getFunraiseExceptionUserFriendlyMessage = (
  code: FunraiseExceptionCode,
): MessageDescriptor => {
  switch (code) {
    case FunraiseExceptionCode.MISSING_CONFIGURATION:
      return msg`Funraise integration is not configured`;
    case FunraiseExceptionCode.MISSING_REQUEST_BODY:
      return msg`Missing Funraise webhook payload`;
    case FunraiseExceptionCode.INVALID_WEBHOOK_PAYLOAD:
      return msg`Invalid Funraise webhook payload`;
    case FunraiseExceptionCode.REST_REQUEST_FAILED:
      return msg`Funraise API request failed`;
    default:
      assertUnreachable(code);
  }
};

export class FunraiseException extends CustomException<FunraiseExceptionCode> {
  constructor(
    message: string,
    code: FunraiseExceptionCode,
    { userFriendlyMessage }: { userFriendlyMessage?: MessageDescriptor } = {},
  ) {
    super(message, code, {
      userFriendlyMessage:
        userFriendlyMessage ?? getFunraiseExceptionUserFriendlyMessage(code),
    });
  }
}
