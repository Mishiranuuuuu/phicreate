import { create } from 'zustand';
import { settingsRepo } from './settingsRepo';
import { DEFAULT_SETTINGS, type Settings } from './types';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  async load() {
    set({ settings: await settingsRepo.load(), loaded: true });
  },

  update(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    void settingsRepo.save(settings);
  },

  reset() {
    const { lastProjectId } = get().settings;
    get().update({ ...DEFAULT_SETTINGS, lastProjectId });
  },
}));
