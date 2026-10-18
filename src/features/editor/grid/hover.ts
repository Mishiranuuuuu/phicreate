import type { Beat } from '@/features/chart/model/types';
import type { ActiveGrid } from '../types';

// Snapped beat under the mouse, shared so shortcuts (paste) can use it.
export const hover: { grid: ActiveGrid | null; beat: Beat | null } = { grid: null, beat: null };

export function setHover(grid: ActiveGrid, beat: Beat | null) {
  if (beat) {
    hover.grid = grid;
    hover.beat = beat;
  } else if (hover.grid === grid) {
    hover.grid = null;
    hover.beat = null;
  }
}
