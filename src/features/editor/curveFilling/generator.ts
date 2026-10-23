// Commits sampled curve notes into the active chart.

import { fromFloat } from '@/features/chart/model/beat';
import { createNote } from '@/features/chart/model/defaults';
import type { Note } from '@/features/chart/model/types';
import { addNotes } from '@/features/chart/runtime/commands';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import type { CurveFillOptions, SampledCurveNote } from './types';

export function commitCurveNotes(
  options: CurveFillOptions,
  sampledNotes: SampledCurveNote[],
): number {
  const chart = useChartStore.getState().chart;
  if (!chart || !sampledNotes.length) return 0;

  const targetLineId =
    options.targetLineId && chart.lines.some((l) => l.id === options.targetLineId)
      ? options.targetLineId
      : chart.lines[0]?.id;

  if (!targetLineId) return 0;

  const notes: Note[] = sampledNotes.map((s) => {
    return createNote({
      type: s.type,
      beat: fromFloat(s.beat, 960),
      endBeat: s.holdEndBeat ? fromFloat(s.holdEndBeat, 960) : undefined,
      x: s.x,
      above: s.above,
      fake: s.fake,
      speed: s.speed,
      alpha: s.alpha,
      size: s.size,
    });
  });

  useChartStore.getState().apply((c) => addNotes(c, targetLineId, notes));

  return notes.length;
}
