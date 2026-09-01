import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';
import { Like } from 'typeorm';

import { type CurrencyMetadata } from 'twenty-shared/types';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { OpportunityWorkspaceEntity } from 'src/modules/opportunity/standard-objects/opportunity.workspace-entity';

import { FUNRAISE_OPPORTUNITY_NAME_PREFIX } from 'src/modules/funraise/constants/funraise.constants';

export type FunraiseCreateOpportunityInput = {
  name: string;
  funraiseId: number;
  amount: CurrencyMetadata;
  closeDate: Date;
  stage: string;
  donationType: string | null;
  pointOfContactId: string;
  companyId: string | null;
};

export type FunraiseFindOrCreateOpportunityResult = {
  opportunity: OpportunityWorkspaceEntity;
  isNew: boolean;
};

@Injectable()
export class FunraiseOpportunityService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async findOrCreateOpportunity(
    input: FunraiseCreateOpportunityInput,
    workspaceId: string,
  ): Promise<FunraiseFindOrCreateOpportunityResult> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const opportunityRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            OpportunityWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );

        const namePrefix = `${FUNRAISE_OPPORTUNITY_NAME_PREFIX} #${input.funraiseId} —`;

        const existingOpportunity = await opportunityRepository.findOneBy({
          name: Like(`${namePrefix}%`),
        });

        if (isDefined(existingOpportunity)) {
          const updates: Record<string, unknown> = {};

          if (isDefined(input.donationType)) {
            const existingType = (existingOpportunity as Record<string, unknown>).donationType;

            if (existingType !== input.donationType) {
              updates.donationType = input.donationType;
            }
          }

          if (
            isDefined(input.companyId) &&
            !isDefined(existingOpportunity.companyId)
          ) {
            updates.companyId = input.companyId;
          }

          if (Object.keys(updates).length > 0) {
            await opportunityRepository.update(
              existingOpportunity.id,
              updates as unknown as Record<string, unknown>,
            );
          }

          return { opportunity: existingOpportunity, isNew: false };
        }

        const insertRecord: Record<string, unknown> = {
          name: input.name,
          amount: input.amount,
          closeDate: input.closeDate,
          stage: input.stage,
          pointOfContactId: input.pointOfContactId,
          companyId: input.companyId,
          position: 0,
        };

        if (isDefined(input.donationType)) {
          insertRecord.donationType = input.donationType;
        }

        const inserted = await opportunityRepository.insert(
          insertRecord as unknown as Parameters<
            typeof opportunityRepository.insert
          >[0],
        );

        const opportunityId = inserted.identifiers[0]?.id;

        if (!isDefined(opportunityId)) {
          throw new Error('Failed to create Funraise opportunity');
        }

        const createdOpportunity = await opportunityRepository.findOne({
          where: { id: opportunityId },
        });

        if (!isDefined(createdOpportunity)) {
          throw new Error('Failed to load created Funraise opportunity');
        }

        return { opportunity: createdOpportunity, isNew: true };
      },
      authContext,
    );
  }
}