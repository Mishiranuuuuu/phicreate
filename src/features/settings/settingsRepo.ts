import { getDB } from '@/lib/db';
import { normalizeSettings, type Settings } from './types';

const KEY = 'user';

export const settingsRepo = {
  async load(): Promise<Settings> {
    const db = await getDB();
    return normalizeSettings(await db.get('settings', KEY));
  },

  async save(settings: Settings) {
    const db = await getDB();
    await db.put('settings', settings, KEY);
  },
};
