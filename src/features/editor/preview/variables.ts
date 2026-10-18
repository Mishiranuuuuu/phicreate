import { toFloat } from '@/features/chart/model/beat';
import { beatToSeconds } from '@/features/chart/model/timing';
import type { Chart } from '@/features/chart/model/types';

// Text variables, e.g. "{combo}" (see chart-data-plan section 4).
export type Variables = Record<string, string>;

const MAX_SCORE = 1_000_000;

export interface ProjectInfo {
  name: string;
  difficulty: string;
}

const comboCache = new WeakMap<Chart, number[]>();

// Chart time each real note counts toward combo (holds: when they end), sorted.
function comboTimes(chart: Chart) {
  let times = comboCache.get(chart);
  if (!times) {
    times = chart.lines
      .flatMap((l) => l.notes)
      .filter((n) => !n.fake)
      .map((n) => beatToSeconds(chart.bpmList, toFloat(n.endBeat ?? n.beat)))
      .sort((a, b) => a - b);
    comboCache.set(chart, times);
  }
  return times;
}

// Combo-counting notes done at or before chart time `t`.
function comboAt(chart: Chart, t: number) {
  const times = comboTimes(chart);
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function chartVariables(chart: Chart, t: number, info: ProjectInfo): Variables {
  const maxNotes = comboTimes(chart).length;
  const combo = comboAt(chart, t);
  const score = maxNotes ? Math.round((MAX_SCORE * combo) / maxNotes) : 0;
  return {
    ...info,
    combo: String(combo),
    // Phigros shows the combo only from 3 on.
    comboAlpha: combo >= 3 ? '255' : '0',
    maxNotes: String(maxNotes),
    score: String(score).padStart(7, '0'),
  };
}

// Unknown variables stay as written.
export const expandText = (text: string, vars: Variables) =>
  text.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
