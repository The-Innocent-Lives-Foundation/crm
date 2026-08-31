import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { CompanyWorkspaceEntity } from 'src/modules/company/standard-objects/company.workspace-entity';

@Injectable()
export class FunraiseCompanyService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async findOrCreateCompany(
    companyName: string,
    workspaceId: string,
  ): Promise<CompanyWorkspaceEntity> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const companyRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            CompanyWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );

        const existingCompany = await companyRepository
          .createQueryBuilder('company')
          .where('LOWER(company.name) = LOWER(:name)', { name: companyName })
          .withDeleted()
          .getOne();

        if (isDefined(existingCompany)) {
          if (isDefined(existingCompany.deletedAt)) {
            await companyRepository.update(existingCompany.id, {
              deletedAt: null,
            });
          }

          return existingCompany;
        }

        const inserted = await companyRepository.insert({
          name: companyName,
          position: 0,
        });

        const companyId = inserted.identifiers[0]?.id;

        if (!isDefined(companyId)) {
          throw new Error('Failed to create Funraise company');
        }

        const createdCompany = await companyRepository.findOne({
          where: { id: companyId },
        });

        if (!isDefined(createdCompany)) {
          throw new Error('Failed to load created Funraise company');
        }

        return createdCompany;
      },
      authContext,
    );
  }
}
