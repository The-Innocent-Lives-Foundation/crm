import { Injectable, Logger } from '@nestjs/common';

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { isDefined } from 'twenty-shared/utils';

import { type FunraiseTransactionData } from 'src/modules/funraise/types/funraise-webhook-payload.type';

// Stores incoming Funraise webhook payloads locally so they survive restarts
// and can be replayed later. Simple append-only JSON Lines format.
// In production you'd use Redis or Postgres; this works for a single-server
// self-hosted deployment.

const STORAGE_DIR = join(
  process.cwd(),
  '.local-storage/funraise-events',
);
const EVENTS_FILE = join(STORAGE_DIR, 'events.jsonl');

type StoredEvent = {
  receivedAt: string;
  funraiseId: number;
  event: string;
  payload: FunraiseTransactionData;
};

const ENSURE_DIR = (): void => {
  if (!existsSync(STORAGE_DIR)) {
    try {
      require('fs').mkdirSync(STORAGE_DIR, { recursive: true });
    } catch {
      // dir already exists from another instance
    }
  }
};

@Injectable()
export class FunraiseEventStoreService {
  private readonly logger = new Logger(FunraiseEventStoreService.name);

  storeEvent(data: FunraiseTransactionData, eventType: string): void {
    ENSURE_DIR();

    const event: StoredEvent = {
      receivedAt: new Date().toISOString(),
      funraiseId: data.id,
      event: eventType,
      payload: data,
    };

    const line = JSON.stringify(event);

    writeFileSync(EVENTS_FILE, line + '\n', { flag: 'a' });
    this.logger.log(`Stored Funraise event #${data.id}`);
  }

  loadEvents(
    since?: Date,
  ): { event: StoredEvent; lineNumber: number }[] {
    if (!existsSync(EVENTS_FILE)) return [];

    const raw = readFileSync(EVENTS_FILE, 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim() !== '');

    return lines
      .map((line, index) => {
        try {
          const evt = JSON.parse(line) as StoredEvent;

          return { event: evt, lineNumber: index };
        } catch {
          this.logger.warn(
            `Corrupt event line #${index} in funraise event store`,
          );

          return null;
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => isDefined(entry))
      .filter(
        ({ event }) =>
          !isDefined(since) || new Date(event.receivedAt) >= since,
      );
  }

  truncate(): void {
    if (existsSync(EVENTS_FILE)) {
      writeFileSync(EVENTS_FILE, '');
    }
  }
}
