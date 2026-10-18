import { createChart, withDefaults } from '../model/defaults';
import type { Chart } from '../model/types';

// Pre-PCC stub shape.
interface LegacyChart {
  bpm?: number;
  offsetMs?: number;
  judgeLines?: unknown[];
}

const migrations: Record<number, (old: Chart) => Chart> = {};

export function migrateChart(raw: unknown): Chart {
  const data = (raw ?? {}) as Partial<Chart> & LegacyChart;
  let chart: Chart;
  if (typeof data.formatVersion !== 'number') {
    chart = createChart(data.bpm ?? 120, data.judgeLines?.length ?? 1);
    chart.offsetMs = data.offsetMs ?? 0;
  } else {
    chart = data as Chart;
    for (let v = chart.formatVersion; migrations[v]; v++) chart = migrations[v](chart);
  }
  return withDefaults(chart);
}
