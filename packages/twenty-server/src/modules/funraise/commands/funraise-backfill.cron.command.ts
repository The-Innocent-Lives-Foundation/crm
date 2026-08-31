import { Command, CommandRunner } from 'nest-commander';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

import { FUNRAISE_BACKFILL_CRON_PATTERN } from 'src/modules/funraise/constants/funraise.constants';
import { FunraiseBackfillCronJob } from 'src/modules/funraise/jobs/funraise-backfill.cron.job';

@Command({
  name: 'cron:funraise:backfill',
  description: 'Starts a cron job to backfill Funraise donations',
})
export class FunraiseBackfillCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.addCron({
      jobName: FunraiseBackfillCronJob.name,
      data: undefined,
      options: {
        repeat: { pattern: FUNRAISE_BACKFILL_CRON_PATTERN },
      },
    });
  }
}
