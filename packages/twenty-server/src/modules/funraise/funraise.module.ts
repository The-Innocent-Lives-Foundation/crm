import { Module } from '@nestjs/common';

import { SecureHttpClientModule } from 'src/engine/core-modules/secure-http-client/secure-http-client.module';

import { FunraiseBackfillCronCommand } from 'src/modules/funraise/commands/funraise-backfill.cron.command';
import { FunraiseWebhookApiExceptionFilter } from 'src/modules/funraise/filters/funraise-webhook-api-exception.filter';
import { FunraiseWebhookController } from 'src/modules/funraise/funraise-webhook.controller';
import { FunraiseBackfillCronJob } from 'src/modules/funraise/jobs/funraise-backfill.cron.job';
import { FunraiseBackfillService } from 'src/modules/funraise/services/funraise-backfill.service';
import { FunraiseCompanyService } from 'src/modules/funraise/services/funraise-company.service';
import { FunraiseNoteService } from 'src/modules/funraise/services/funraise-note.service';
import { FunraiseOpportunityService } from 'src/modules/funraise/services/funraise-opportunity.service';
import { FunraisePersonService } from 'src/modules/funraise/services/funraise-person.service';
import { FunraiseRestClientService } from 'src/modules/funraise/services/funraise-rest-client.service';
import { FunraiseTransactionService } from 'src/modules/funraise/services/funraise-transaction.service';
import { FunraiseWebhookService } from 'src/modules/funraise/services/funraise-webhook.service';

@Module({
  imports: [SecureHttpClientModule],
  controllers: [FunraiseWebhookController],
  providers: [
    FunraiseWebhookApiExceptionFilter,
    FunraiseWebhookService,
    FunraisePersonService,
    FunraiseCompanyService,
    FunraiseOpportunityService,
    FunraiseNoteService,
    FunraiseTransactionService,
    FunraiseRestClientService,
    FunraiseBackfillService,
    FunraiseBackfillCronJob,
    FunraiseBackfillCronCommand,
  ],
  exports: [
    FunraiseTransactionService,
    FunraiseBackfillService,
    FunraiseBackfillCronCommand,
  ],
})
export class FunraiseModule {}
