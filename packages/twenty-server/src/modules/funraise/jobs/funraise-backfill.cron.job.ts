import { Logger } from '@nestjs/common';

import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';

import { FUNRAISE_BACKFILL_CRON_PATTERN } from 'src/modules/funraise/constants/funraise.constants';
import { FunraiseBackfillService } from 'src/modules/funraise/services/funraise-backfill.service';

@Processor({
  queueName: MessageQueue.cronQueue,
})
export class FunraiseBackfillCronJob {
  private readonly logger = new Logger(FunraiseBackfillCronJob.name);

  constructor(private readonly funraiseBackfillService: FunraiseBackfillService) {}

  @Process(FunraiseBackfillCronJob.name)
  @SentryCronMonitor(FunraiseBackfillCronJob.name, FUNRAISE_BACKFILL_CRON_PATTERN)
  async handle(): Promise<void> {
    this.logger.log('Running Funraise backfill');

    await this.funraiseBackfillService.backfill();
  }
}
