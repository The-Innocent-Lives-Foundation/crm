import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { NoteWorkspaceEntity } from 'src/modules/note/standard-objects/note.workspace-entity';
import { NoteTargetWorkspaceEntity } from 'src/modules/note/standard-objects/note-target.workspace-entity';

@Injectable()
export class FunraiseNoteService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async createNoteOnOpportunity(
    body: string,
    opportunityId: string,
    workspaceId: string,
  ): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const noteRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            NoteWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );

        const noteTargetRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            NoteTargetWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );

        const insertedNote = await noteRepository.insert({
          title: 'Funraise donation',
          bodyV2: { markdown: body },
          position: 0,
        });

        const noteId = insertedNote.identifiers[0]?.id;

        if (!isDefined(noteId)) {
          throw new Error('Failed to create Funraise note');
        }

        await noteTargetRepository.insert({
          noteId,
          targetOpportunityId: opportunityId,
        });
      },
      authContext,
    );
  }
}
