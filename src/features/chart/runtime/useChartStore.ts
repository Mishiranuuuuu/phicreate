import { create } from 'zustand';
import type { Chart } from '../model/types';

const HISTORY_LIMIT = 200;

interface ChartState {
  projectId: string | null;
  chart: Chart | null;
  past: Chart[];
  future: Chart[];
  load: (projectId: string, chart: Chart) => void;
  unload: () => void;
  apply: (fn: (chart: Chart) => Chart) => void;
  // Transient edit without pushing to history (used while actively dragging/scrubbing).
  transactPreview: (fn: (chart: Chart) => Chart) => void;
  // Commits a finished transaction, recording beforeChart as the single past undo snapshot.
  commitTransaction: (beforeChart: Chart) => void;
  // Applies to every snapshot without a history entry (e.g. file renames).
  rewrite: (fn: (chart: Chart) => Chart) => void;
  undo: () => void;
  redo: () => void;
}

// Snapshot history; edits are immutable so snapshots share structure.
export const useChartStore = create<ChartState>((set, get) => ({
  projectId: null,
  chart: null,
  past: [],
  future: [],

  load(projectId, chart) {
    set({ projectId, chart, past: [], future: [] });
  },

  unload() {
    set({ projectId: null, chart: null, past: [], future: [] });
  },

  apply(fn) {
    const { chart, past } = get();
    if (!chart) return;
    const next = fn(chart);
    if (next === chart) return;
    set({ chart: next, past: [...past, chart].slice(-HISTORY_LIMIT), future: [] });
  },

  transactPreview(fn) {
    const { chart } = get();
    if (!chart) return;
    const next = fn(chart);
    if (next === chart) return;
    set({ chart: next });
  },

  commitTransaction(beforeChart) {
    const { chart, past } = get();
    if (!chart || chart === beforeChart) return;
    set({ past: [...past, beforeChart].slice(-HISTORY_LIMIT), future: [] });
  },

  rewrite(fn) {
    const { chart, past, future } = get();
    if (!chart) return;
    set({ chart: fn(chart), past: past.map(fn), future: future.map(fn) });
  },

  undo() {
    const { chart, past, future } = get();
    if (!chart || !past.length) return;
    set({ chart: past[past.length - 1], past: past.slice(0, -1), future: [chart, ...future] });
  },

  redo() {
    const { chart, past, future } = get();
    if (!chart || !future.length) return;
    set({ chart: future[0], past: [...past, chart], future: future.slice(1) });
  },
}));
