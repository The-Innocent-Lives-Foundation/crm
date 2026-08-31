import { Injectable, Logger } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { FunraiseCompanyService } from 'src/modules/funraise/services/funraise-company.service';
import { FunraiseNoteService } from 'src/modules/funraise/services/funraise-note.service';
import { FunraiseOpportunityService } from 'src/modules/funraise/services/funraise-opportunity.service';
import { FunraisePersonService } from 'src/modules/funraise/services/funraise-person.service';
import { type FunraiseTransactionData } from 'src/modules/funraise/types/funraise-webhook-payload.type';
import { mapFunraiseTransaction } from 'src/modules/funraise/utils/map-funraise-transaction.util';

@Injectable()
export class FunraiseTransactionService {
  private readonly logger = new Logger(FunraiseTransactionService.name);

  constructor(
    private readonly funraisePersonService: FunraisePersonService,
    private readonly funraiseCompanyService: FunraiseCompanyService,
    private readonly funraiseOpportunityService: FunraiseOpportunityService,
    private readonly funraiseNoteService: FunraiseNoteService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  async processTransaction(
    data: FunraiseTransactionData,
    workspaceId: string,
  ): Promise<void> {
    const stageWon =
      this.twentyConfigService.get('FUNRAISE_OPPORTUNITY_STAGE_WON') ??
      'CUSTOMER';
    const stageOpen =
      this.twentyConfigService.get('FUNRAISE_OPPORTUNITY_STAGE_OPEN') ?? 'NEW';

    const mapped = mapFunraiseTransaction(data, stageWon, stageOpen);

    const person = await this.funraisePersonService.findOrCreatePerson(
      mapped.person,
      workspaceId,
    );

    let companyId: string | null = null;

    if (isNonEmptyString(mapped.companyName)) {
      const company = await this.funraiseCompanyService.findOrCreateCompany(
        mapped.companyName,
        workspaceId,
      );

      companyId = company.id;
    }

    const { opportunity, isNew } =
      await this.funraiseOpportunityService.findOrCreateOpportunity(
        {
          name: mapped.opportunityName,
          funraiseId: data.id,
          amount: mapped.opportunityAmount,
          closeDate: mapped.opportunityCloseDate,
          stage: mapped.opportunityStage,
          pointOfContactId: person.id,
          companyId,
        },
        workspaceId,
      );

    if (isNew && isNonEmptyString(mapped.noteBody)) {
      await this.funraiseNoteService.createNoteOnOpportunity(
        mapped.noteBody,
        opportunity.id,
        workspaceId,
      );
    }

    this.logger.log(
      `Processed Funraise transaction #${data.id} into workspace ${workspaceId}`,
    );
  }
}
