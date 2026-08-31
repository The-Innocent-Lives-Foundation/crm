import { Injectable, Logger } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';

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
  ) {}

  async processTransaction(
    data: FunraiseTransactionData,
    workspaceId: string,
  ): Promise<void> {
    const mapped = mapFunraiseTransaction(data);

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

    const opportunity =
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

    if (isNonEmptyString(mapped.noteBody)) {
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
