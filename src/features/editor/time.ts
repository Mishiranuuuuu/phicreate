import { toFloat } from '@/features/chart/model/beat';
import { beatToSeconds, secondsToBeat } from '@/features/chart/model/timing';
import type { Chart, NoteType } from '@/features/chart/model/types';
import { useSettingsStore } from '@/features/settings/useSettingsStore';

// Chart time = music time − (chart offset + device offset).
const offsetSeconds = (chart: Chart) =>
  (chart.offsetMs + useSettingsStore.getState().settings.audioOffsetMs) / 1000;

export const toChartTime = (chart: Chart, musicTime: number) => musicTime - offsetSeconds(chart);
export const toMusicTime = (chart: Chart, chartTime: number) => chartTime + offsetSeconds(chart);

export const musicTimeToBeat = (chart: Chart, musicTime: number) =>
  secondsToBeat(chart.bpmList, toChartTime(chart, musicTime));

export const beatToMusicTime = (chart: Chart, beat: number) =>
  toMusicTime(chart, beatToSeconds(chart.bpmList, beat));

export interface Hit {
  time: number;
  type: NoteType;
}

const hitCache = new WeakMap<Chart, Hit[]>();

// Every real (non-fake) note head, sorted by chart time.
export function getHits(chart: Chart) {
  let hits = hitCache.get(chart);
  if (!hits) {
    hits = [];
    for (const line of chart.lines) {
      for (const n of line.notes) {
        if (!n.fake)
          hits.push({ time: beatToSeconds(chart.bpmList, toFloat(n.beat)), type: n.type });
      }
    }
    hits.sort((a, b) => a.time - b.time);
    hitCache.set(chart, hits);
  }
  return hits;
}

const endBeatCache = new WeakMap<Chart, number>();

export function chartEndTime(chart: Chart) {
  let end = endBeatCache.get(chart);
  if (end === undefined) {
    end = 0;
    for (const line of chart.lines) {
      for (const n of line.notes) end = Math.max(end, toFloat(n.endBeat ?? n.beat));
    }
    endBeatCache.set(chart, end);
  }
  return beatToMusicTime(chart, end);
}

export function formatTime(seconds: number) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(3).padStart(6, '0')}`;
}
