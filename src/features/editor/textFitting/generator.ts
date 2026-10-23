import { fromFloat } from '@/features/chart/model/beat';
import { createNote } from '@/features/chart/model/defaults';
import type { Note } from '@/features/chart/model/types';
import { addNotes } from '@/features/chart/runtime/commands';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import type { FittedNotePoint, TextFittingOptions } from './types';

export function commitTextNotes(
  points: FittedNotePoint[],
  options: TextFittingOptions,
): { success: boolean; count: number; message?: string } {
  if (points.length === 0) {
    return { success: false, count: 0, message: 'No notes to generate (empty text or spacing too large).' };
  }

  const chart = useChartStore.getState().chart;
  if (!chart) {
    return { success: false, count: 0, message: 'No active chart loaded.' };
  }

  const targetLineId = options.targetLineId ?? chart.lines[0]?.id;
  if (!targetLineId) {
    return { success: false, count: 0, message: 'No target judgment line available.' };
  }

  const line = chart.lines.find((l) => l.id === targetLineId);
  if (!line) {
    return { success: false, count: 0, message: 'Target judgment line not found.' };
  }

  const notes: Note[] = points.map((p) =>
    createNote({
      type: options.noteType,
      beat: fromFloat(p.beat, 960),
      x: p.x,
      above: options.above,
      fake: options.fake,
      speed: Number.isFinite(options.speed) ? options.speed : 1,
      size: Number.isFinite(options.noteSize) ? options.noteSize : 1,
      yOffset: p.y,
      visibleTime: 999999,
    }),
  );

  useChartStore.getState().apply((c) => addNotes(c, targetLineId, notes));

  return {
    success: true,
    count: notes.length,
    message: `Generated ${notes.length} ${options.noteType.toUpperCase()} notes for "${options.text.trim()}"`,
  };
}
