import { isNonEmptyString } from '@sniptt/guards';
import {
  type CurrencyMetadata,
  type EmailsMetadata,
  type FullNameMetadata,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { FUNRAISE_OPPORTUNITY_NAME_PREFIX } from 'src/modules/funraise/constants/funraise.constants';
import { type FunraiseTransactionData } from 'src/modules/funraise/types/funraise-webhook-payload.type';
import { getParsedNameFromDisplayName } from 'src/modules/contact-creation-manager/utils/get-parsed-name-from-display-name.util';

export type FunraiseMappedPerson = {
  name: FullNameMetadata;
  emails: EmailsMetadata;
};

export type FunraiseMappedTransaction = {
  person: FunraiseMappedPerson;
  companyName: string | null;
  opportunityName: string;
  opportunityAmount: CurrencyMetadata;
  opportunityCloseDate: Date;
  opportunityStage: string;
  noteBody: string | null;
};

const AMOUNT_MICROS_PER_UNIT = 1_000_000;

const buildPersonName = (
  data: FunraiseTransactionData,
): FullNameMetadata => {
  const { supporter } = data;
  const firstName = supporter.firstName?.trim();
  const lastName = supporter.lastName?.trim();

  if (isNonEmptyString(firstName) || isNonEmptyString(lastName)) {
    return {
      firstName: firstName ?? '',
      lastName: lastName ?? '',
    };
  }

  if (isNonEmptyString(supporter.name)) {
    return getParsedNameFromDisplayName(supporter.name);
  }

  return { firstName: '', lastName: '' };
};

const buildPersonEmails = (data: FunraiseTransactionData): EmailsMetadata => {
  const email = data.supporter.email?.trim().toLowerCase();

  return {
    primaryEmail: email ?? '',
    additionalEmails: [],
  };
};

const buildOpportunityName = (data: FunraiseTransactionData): string => {
  const humanReadable =
    data.description?.trim() ||
    data.supporter.name?.trim() ||
    data.supporter.email?.trim() ||
    'unknown donor';

  return `${FUNRAISE_OPPORTUNITY_NAME_PREFIX} #${data.id} — ${humanReadable}`;
};

const buildOpportunityAmount = (
  data: FunraiseTransactionData,
): CurrencyMetadata => {
  const amount = data.transaction.amount ?? 0;

  return {
    amountMicros: Math.round(amount * AMOUNT_MICROS_PER_UNIT),
    currencyCode: data.transaction.currency ?? 'USD',
  };
};

const buildOpportunityStage = (data: FunraiseTransactionData): string =>
  data.transaction.status === 'Complete' ? 'CUSTOMER' : 'NEW';

const buildNoteBody = (data: FunraiseTransactionData): string | null => {
  const lines: string[] = [];

  if (data.dedication) {
    if (isNonEmptyString(data.dedication.type)) {
      lines.push(`Dedication: ${data.dedication.type}`);
    }
    if (isNonEmptyString(data.dedication.name)) {
      lines.push(`In honor of ${data.dedication.name}`);
    }
    if (isNonEmptyString(data.dedication.message)) {
      lines.push(data.dedication.message);
    }
  }

  if (isNonEmptyString(data.comment)) {
    lines.push(data.comment);
  }

  if (isNonEmptyString(data.note)) {
    lines.push(data.note);
  }

  if (isDefined(data.subscription)) {
    lines.push(`Recurring donation #${data.subscription.id} (sequence ${data.subscription.sequence})`);
  }

  if (isDefined(data.allocation)) {
    lines.push(`Allocation: ${data.allocation.name}`);
  }

  if (isDefined(data.form)) {
    lines.push(`Form: ${data.form.name}`);
  }

  if (isDefined(data.campaignPage)) {
    lines.push(`Campaign page: ${data.campaignPage.name}`);
  }

  if (data.anonymous) {
    lines.push('Anonymous donation');
  }

  return lines.length > 0 ? lines.join('\n') : null;
};

export const mapFunraiseTransaction = (
  data: FunraiseTransactionData,
): FunraiseMappedTransaction => ({
  person: {
    name: buildPersonName(data),
    emails: buildPersonEmails(data),
  },
  companyName: isNonEmptyString(data.companyMatch?.companyName)
    ? data.companyMatch?.companyName?.trim() ?? null
    : null,
  opportunityName: buildOpportunityName(data),
  opportunityAmount: buildOpportunityAmount(data),
  opportunityCloseDate: new Date(data.donationDate),
  opportunityStage: buildOpportunityStage(data),
  noteBody: buildNoteBody(data),
});
