import { toFloat } from '@/features/chart/model/beat';
import type { Note } from '@/features/chart/model/types';
import { NOTE_COLORS } from '../types';
import { GridGeometry, NOTE_HEIGHT } from '../grid/geometry';

interface NoteStyle {
  selected?: boolean;
  ghost?: boolean;
  dBeat?: number;
  dx?: number;
}

export function drawNote(
  ctx: CanvasRenderingContext2D,
  g: GridGeometry,
  n: Note,
  { selected, ghost, dBeat = 0, dx = 0 }: NoteStyle = {},
) {
  const r = g.noteRect(n, dBeat, dx);
  if (r.bottom < -20 || r.top > g.height + 20) return;
  const color = NOTE_COLORS[n.type];
  const past = toFloat(n.endBeat ?? n.beat) + dBeat < g.beat - 1e-6;

  let alpha = n.above ? 1 : 0.55;
  if (past) alpha *= 0.45;
  if (ghost) alpha = 0.4;
  ctx.globalAlpha = alpha;

  if (n.type === 'hold') {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha * 0.45;
    ctx.fillRect(r.left + r.w * 0.1, r.top, r.w * 0.8, r.y - r.top);
    ctx.globalAlpha = alpha;
  }

  const headY = r.y - NOTE_HEIGHT / 2;
  if (n.fake) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(r.left + 1, headY + 1, r.w - 2, NOTE_HEIGHT - 2);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(r.left, headY, r.w, NOTE_HEIGHT);
  }
  if (n.type === 'flick') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(r.cx - 3, headY, 6, NOTE_HEIGHT);
  }

  if (selected) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.left - 2, r.top - 2, r.w + 4, r.bottom - r.top + 4);
  }
  ctx.globalAlpha = 1;
}
