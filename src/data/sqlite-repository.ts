import type { AppData } from '../domain/types';
import { expandCatalog } from '../content/catalog';
import { validateAppData } from './backup';
import { readLegacyWorkspace } from './legacy-indexeddb';
import { StoreConflictError, type Repository } from './repository';
import { nativeSqliteDatabase, type SqliteDatabase } from './sqlite-database';
import { migrateLegacyWorkspace } from './sqlite-migration';

export class SqliteRepository implements Repository {
  constructor(
    private readonly database: SqliteDatabase = nativeSqliteDatabase,
    private readonly readLegacy: () => Promise<unknown | null> = readLegacyWorkspace,
  ) {}

  load(): Promise<AppData> {
    return this.database.transaction(async (tx) => {
      const current = await migrateLegacyWorkspace(tx, this.readLegacy);
      const expanded = expandCatalog(current);
      if (expanded === current) return current;
      if (current.revision >= Number.MAX_SAFE_INTEGER - 1) throw new Error('本地数据版本已达上限，请先导出备份');
      const next = { ...expanded, revision: current.revision + 1 };
      const changes = await tx.run("UPDATE workspace SET revision=?, payload=? WHERE id='main' AND revision=?", [
        next.revision,
        JSON.stringify(next),
        current.revision,
      ]);
      if (changes !== 1) throw new StoreConflictError();
      return next;
    });
  }

  async save(data: AppData, expectedRevision: number): Promise<AppData> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('本地数据版本无效');
    const validated = validateAppData(data);
    return this.database.transaction(async (tx) => {
      const current = await migrateLegacyWorkspace(tx, this.readLegacy);
      if (current.revision !== expectedRevision) throw new StoreConflictError();
      if (current.revision >= Number.MAX_SAFE_INTEGER - 1) throw new Error('本地数据版本已达上限，请先导出备份');
      if (current.schemaVersion === 2 && validated.schemaVersion === 3) {
        await tx.run('INSERT OR IGNORE INTO storage_meta (key, value) VALUES (?, ?)', ['appdata-v2-before-v3', JSON.stringify(current)]);
      }
      if (current.schemaVersion < 4 && validated.schemaVersion === 4) {
        await tx.run('INSERT OR IGNORE INTO storage_meta (key, value) VALUES (?, ?)', ['appdata-before-v4', JSON.stringify(current)]);
      }
      const next = { ...validated, revision: current.revision + 1 };
      const changes = await tx.run("UPDATE workspace SET revision=?, payload=? WHERE id='main' AND revision=?", [
        next.revision,
        JSON.stringify(next),
        expectedRevision,
      ]);
      if (changes !== 1) throw new StoreConflictError();
      return next;
    });
  }

  close(): Promise<void> {
    return this.database.close();
  }
}
