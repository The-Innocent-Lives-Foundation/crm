import { Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';

import { addPersonEmailFiltersToQueryBuilder } from 'src/modules/match-participant/utils/add-person-email-filters-to-query-builder';

import { type FunraiseMappedPerson } from 'src/modules/funraise/utils/map-funraise-transaction.util';

@Injectable()
export class FunraisePersonService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async findOrCreatePerson(
    person: FunraiseMappedPerson,
    workspaceId: string,
  ): Promise<PersonWorkspaceEntity> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const personRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            PersonWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );

        const email = person.emails.primaryEmail;

        if (isNonEmptyString(email)) {
          const queryBuilder = addPersonEmailFiltersToQueryBuilder({
            queryBuilder: personRepository.createQueryBuilder('person'),
            emails: [email],
          });

          const existingPerson = await queryBuilder
            .orderBy('person.createdAt', 'ASC')
            .withDeleted()
            .getOne();

          if (isDefined(existingPerson)) {
            if (isDefined(existingPerson.deletedAt)) {
              await personRepository.update(existingPerson.id, {
                deletedAt: null,
              });
            }

            return existingPerson;
          }
        } else {
          // No email: dedup by name to avoid creating duplicates.
          const firstName = person.name.firstName;
          const lastName = person.name.lastName;

          if (isNonEmptyString(firstName) || isNonEmptyString(lastName)) {
            const existingPerson = await personRepository
              .createQueryBuilder('person')
              .where('LOWER(person.nameFirstName) = LOWER(:firstName)', {
                firstName: firstName ?? '',
              })
              .andWhere('LOWER(person.nameLastName) = LOWER(:lastName)', {
                lastName: lastName ?? '',
              })
              .orderBy('person.createdAt', 'ASC')
              .withDeleted()
              .getOne();

            if (isDefined(existingPerson)) {
              if (isDefined(existingPerson.deletedAt)) {
                await personRepository.update(existingPerson.id, {
                  deletedAt: null,
                });
              }

              return existingPerson;
            }
          }
        }

        const inserted = await personRepository.insert({
          name: person.name,
          // Empty email -> null so the unique index on emailsPrimaryEmail
          // does not collide across multiple no-email donors.
          emails: {
            ...person.emails,
            primaryEmail: isNonEmptyString(email)
              ? email
              : (null as unknown as string),
          },
          position: 0,
        });

        const personId = inserted.identifiers[0]?.id;

        if (!isDefined(personId)) {
          throw new Error('Failed to create Funraise supporter person');
        }

        const createdPerson = await personRepository.findOne({
          where: { id: personId },
        });

        if (!isDefined(createdPerson)) {
          throw new Error('Failed to load created Funraise supporter person');
        }

        return createdPerson;
      },
      authContext,
    );
  }
}
