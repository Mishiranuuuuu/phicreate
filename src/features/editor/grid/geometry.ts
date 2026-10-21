import { toFloat } from '@/features/chart/model/beat';
import { CANVAS_WIDTH } from '@/features/chart/model/defaults';
import type { Note } from '@/features/chart/model/types';

export const GUTTER = 56;
export const PAD = 12;
export const JUDGE_RATIO = 0.82;
export const NOTE_HEIGHT = 8;
// Note width in canvas units at size 1.
export const NOTE_WIDTH = 135;

const HALF = CANVAS_WIDTH / 2;

// Maps chart space (x units, beats) to grid pixels.
export class GridGeometry {
  readonly x0: number;
  readonly x1: number;
  readonly judgeY: number;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly pxPerBeat: number,
    readonly beat: number,
  ) {
    this.x0 = GUTTER;
    this.x1 = Math.max(GUTTER + 1, width - PAD);
    this.judgeY = height * JUDGE_RATIO;
  }

  xToPx = (x: number) => this.x0 + ((x + HALF) / CANVAS_WIDTH) * (this.x1 - this.x0);
  pxToX = (px: number) => ((px - this.x0) / (this.x1 - this.x0)) * CANVAS_WIDTH - HALF;
  beatToY = (beat: number) => this.judgeY - (beat - this.beat) * this.pxPerBeat;
  yToBeat = (y: number) => this.beat + (this.judgeY - y) / this.pxPerBeat;

  // CSS zoom scales getBoundingClientRect() while width/height stay in local CSS pixels.
  point(canvas: HTMLCanvasElement, e: { clientX: number; clientY: number }): [number, number] {
    const r = canvas.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * this.width) / (r.width || 1),
      ((e.clientY - r.top) * this.height) / (r.height || 1),
    ];
  }

  get noteWidth() {
    return (NOTE_WIDTH / CANVAS_WIDTH) * (this.x1 - this.x0);
  }

  noteRect(n: Note, dBeat = 0, dx = 0) {
    const cx = this.xToPx(n.x + dx);
    const w = this.noteWidth * n.size;
    const y = this.beatToY(toFloat(n.beat) + dBeat);
    const top = n.endBeat ? this.beatToY(toFloat(n.endBeat) + dBeat) : y - NOTE_HEIGHT / 2;
    return { left: cx - w / 2, right: cx + w / 2, top, bottom: y + NOTE_HEIGHT / 2, y, w, cx };
  }
}

export function snapX(x: number, lanes: number, enabled: boolean) {
  if (!enabled || lanes < 1) return Math.round(x);
  const step = CANVAS_WIDTH / lanes;
  return Math.round((Math.round((x + HALF) / step - 0.5) + 0.5) * step - HALF);
}

// Snap positions sit at lane centers, so only odd counts include x = 0.
export const laneXs = (lanes: number) =>
  Array.from({ length: lanes }, (_, i) => -HALF + ((i + 0.5) * CANVAS_WIDTH) / lanes);

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// Whether segment a→b touches the rect (Liang–Barsky clip).
export function segmentHitsRect(ax: number, ay: number, bx: number, by: number, r: Rect) {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, ax - r.left],
    [dx, r.right - ax],
    [-dy, ay - r.top],
    [dy, r.bottom - ay],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}
