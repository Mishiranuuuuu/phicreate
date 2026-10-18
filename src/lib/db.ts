import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ProjectMeta } from '@/features/projects/types';
import type { Settings } from '@/features/settings/types';

const DB_NAME = 'phicreate';
const DB_VERSION = 2;

export interface PhiCreateDB extends DBSchema {
  projects: { key: string; value: ProjectMeta; indexes: { updatedAt: number } };
  // Raw; read through migrateChart().
  charts: { key: string; value: unknown };
  // Key: `${projectId}:audio` | `${projectId}:illustration` | `${projectId}:media:${assetId}`
  // | `${projectId}:shader:${path}` | `${projectId}:font:${fileName}`
  assets: { key: string; value: Blob };
  settings: { key: string; value: Settings };
}

let dbPromise: Promise<IDBPDatabase<PhiCreateDB>> | null = null;

// Single schema/migration point.
export function getDB() {
  dbPromise ??= openDB<PhiCreateDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const projects = db.createObjectStore('projects', { keyPath: 'id' });
        projects.createIndex('updatedAt', 'updatedAt');
        db.createObjectStore('charts');
        db.createObjectStore('settings');
      }
      if (oldVersion < 2) db.createObjectStore('assets');
    },
  });
  return dbPromise;
}
