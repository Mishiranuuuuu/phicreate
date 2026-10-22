import { create } from 'zustand';
import type { Id } from '@/features/chart/model/types';
import { playback } from './playback/playback';
import { primeHitsound } from './playback/hitsound';
import type { ActiveGrid, EditorMode, NoteDefaults } from './types';

// Session-level editor state (never exported; see chart-data-plan §6).
interface EditorState {
  projectName: string;
  difficulty: string;
  mode: EditorMode;
  fullscreen: boolean;
  activeGrid: ActiveGrid;
  division: number;
  pxPerBeat: number;
  lanes: number;
  snapX: boolean;
  snapY: boolean;
  noteDefaults: NoteDefaults;
  previewBehind: boolean;
  rate: number;
  // Preview only: frame width / height, and zoom (1 = normal, larger = zoom out).
  aspect: number;
  fov: number;
  // Preview shader effects.
  shaders: boolean;
  showUI: boolean;
  showText: boolean;
  showMedia: boolean;
  showNoise: boolean;
  selectedLineId: Id | null;
  // Text or media; mutually exclusive with selectedLineId.
  selectedObjectId: Id | null;
  selectedNoteIds: Id[];
  // Right sidebar shows the selected object's properties.
  objectPanelOpen: boolean;
  // New-event easing (RPE preset id).
  eventEasing: number;
  selectedLayerId: Id | null;
  selectedEventIds: Id[];
  // Music time in seconds (before chart offset).
  time: number;
  duration: number;
  playing: boolean;
  saveStatus: 'saved' | 'unsaved' | 'saving';

  set: (patch: Partial<EditorState>) => void;
  reset: (lineId: Id | null) => void;
  selectLine: (id: Id | null) => void;
  selectObject: (id: Id | null) => void;
  selectNotes: (ids: Id[]) => void;
  selectLayer: (id: Id | null) => void;
  selectEvents: (ids: Id[]) => void;
  togglePlay: () => Promise<void>;
  pause: () => void;
  seek: (seconds: number) => void;
  setRate: (rate: number) => void;
}

const initial = {
  projectName: '',
  difficulty: '',
  mode: 'edit' as EditorMode,
  fullscreen: false,
  activeGrid: 'notes' as ActiveGrid,
  division: 4,
  pxPerBeat: 160,
  lanes: 16,
  snapX: true,
  snapY: true,
  noteDefaults: { speed: 1, alpha: 255, size: 1, yOffset: 0, above: true, fake: false },
  previewBehind: true,
  rate: 1,
  aspect: 3 / 2,
  fov: 1,
  shaders: true,
  showUI: true,
  showText: true,
  showMedia: true,
  showNoise: true,
  selectedLineId: null,
  selectedObjectId: null,
  selectedNoteIds: [],
  objectPanelOpen: false,
  eventEasing: 1,
  selectedLayerId: null,
  selectedEventIds: [],
  time: 0,
  duration: 0,
  playing: false,
  saveStatus: 'saved' as EditorState['saveStatus'],
};

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initial,

  set,

  reset(lineId) {
    playback.setRate(1);
    set({ ...initial, selectedLineId: lineId });
  },

  selectLine(id) {
    set({
      selectedLineId: id,
      selectedObjectId: null,
      selectedNoteIds: [],
      selectedLayerId: null,
      selectedEventIds: [],
    });
  },

  selectObject(id) {
    set({
      selectedLineId: null,
      selectedObjectId: id,
      activeGrid: 'events',
      selectedNoteIds: [],
      selectedLayerId: null,
      selectedEventIds: [],
    });
  },

  selectLayer(id) {
    set({ selectedLayerId: id, selectedEventIds: [] });
  },

  selectEvents(ids) {
    set({ selectedEventIds: ids });
  },

  selectNotes(ids) {
    set({ selectedNoteIds: ids });
  },

  async togglePlay() {
    if (get().playing) return get().pause();
    primeHitsound();
    try {
      await playback.play();
      set({ playing: true });
    } catch {
      set({ playing: false });
    }
  },

  pause() {
    playback.pause();
    set({ playing: false, time: playback.time });
  },

  seek(seconds) {
    const { duration } = get();
    const t = Math.max(0, duration ? Math.min(seconds, duration) : seconds);
    playback.seek(t);
    set({ time: t });
  },

  setRate(rate) {
    playback.setRate(rate);
    set({ rate });
  },
}));
