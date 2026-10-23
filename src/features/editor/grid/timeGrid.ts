import { toFloat } from '@/features/chart/model/beat';
import type { Chart, TimeTag } from '@/features/chart/model/types';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { playback } from '../playback/playback';
import type { WaveformData } from '../playback/waveform';
import { beatToMusicTime } from '../time';
import type { GridGeometry } from './geometry';

export interface Palette {
  bg: string;
  surface: string;
  border: string;
  muted: string;
  text: string;
  accent: string;
}

export function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    bg: v('--c-bg'),
    surface: v('--c-surface'),
    border: v('--c-border'),
    muted: v('--c-text-muted'),
    text: v('--c-text'),
    accent: v('--c-accent'),
  };
}

// Header strip over the top of a grid.
export const HEADER_HEIGHT = 34;

export function drawHeaderStrip(ctx: CanvasRenderingContext2D, g: GridGeometry, p: Palette) {
  ctx.fillStyle = p.surface;
  ctx.globalAlpha = 0.92;
  ctx.fillRect(0, 0, g.width, HEADER_HEIGHT);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = p.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HEADER_HEIGHT + 0.5);
  ctx.lineTo(g.width, HEADER_HEIGHT + 0.5);
  ctx.stroke();
}

// Strip along the bottom of a grid.
export const FOOTER_HEIGHT = 34;

export function drawFooterStrip(ctx: CanvasRenderingContext2D, g: GridGeometry, p: Palette) {
  const top = g.height - FOOTER_HEIGHT;
  ctx.fillStyle = p.surface;
  ctx.globalAlpha = 0.92;
  ctx.fillRect(0, top, g.width, FOOTER_HEIGHT);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = p.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, top - 0.5);
  ctx.lineTo(g.width, top - 0.5);
  ctx.stroke();
}

// Header and footer strips aren't part of the editable area.
export const outsideGrid = (g: GridGeometry, py: number) =>
  py < HEADER_HEIGHT || py > g.height - FOOTER_HEIGHT;

export interface Vertical {
  px: number;
  strong?: boolean;
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  g: GridGeometry,
  p: Palette,
  chart: Chart,
  waveform: WaveformData,
) {
  const top = HEADER_HEIGHT;
  const bottom = g.height - FOOTER_HEIGHT;
  if (bottom <= top) return;

  const cx = (g.x0 + g.x1) / 2;
  const maxW = (g.x1 - g.x0) * 0.46;

  ctx.save();
  ctx.beginPath();
  ctx.rect(g.x0, top, g.x1 - g.x0, bottom - top);
  ctx.clip();

  ctx.fillStyle = p.accent;
  ctx.globalAlpha = 0.16;

  ctx.beginPath();
  let started = false;
  for (let y = top; y <= bottom; y += 2) {
    const beat = g.yToBeat(y);
    const time = beatToMusicTime(chart, beat);
    const amp = waveform.sampleAt(time);
    const w = amp * maxW;
    if (!started) {
      ctx.moveTo(cx + w, y);
      started = true;
    } else {
      ctx.lineTo(cx + w, y);
    }
  }
  for (let y = bottom; y >= top; y -= 2) {
    const beat = g.yToBeat(y);
    const time = beatToMusicTime(chart, beat);
    const amp = waveform.sampleAt(time);
    const w = amp * maxW;
    ctx.lineTo(cx - w, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Backdrop, vertical guides, beat lines, time tags and the playhead (judge line).
export function drawTimeGrid(
  ctx: CanvasRenderingContext2D,
  g: GridGeometry,
  p: Palette,
  division: number,
  verticals: Vertical[],
  // < 1 lets the gameplay preview show through.
  backdrop = 1,
  timeTags?: TimeTag[],
  chart?: Chart,
) {
  ctx.clearRect(0, 0, g.width, g.height);
  ctx.globalAlpha = backdrop;
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, g.width, g.height);
  ctx.fillStyle = p.surface;
  ctx.fillRect(g.x0, 0, g.x1 - g.x0, g.height);
  ctx.globalAlpha = 1;

  if (chart && useSettingsStore.getState().settings.showWaveform) {
    const waveform = playback.getWaveform();
    if (waveform) drawWaveform(ctx, g, p, chart, waveform);
  }

  ctx.lineWidth = 1;
  ctx.strokeStyle = p.border;
  for (const v of verticals) {
    const px = Math.round(v.px) + 0.5;
    ctx.globalAlpha = v.strong ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, g.height);
    ctx.stroke();
  }

  const first = Math.max(0, Math.ceil(g.yToBeat(g.height) * division));
  const last = Math.floor(g.yToBeat(0) * division);
  ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let k = first; k <= last; k++) {
    const y = Math.round(g.beatToY(k / division)) + 0.5;
    const whole = k % division === 0;
    ctx.strokeStyle = whole ? p.muted : p.border;
    ctx.globalAlpha = whole ? 0.6 : 0.8;
    ctx.beginPath();
    ctx.moveTo(g.x0, y);
    ctx.lineTo(g.x1, y);
    ctx.stroke();
    if (whole) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.muted;
      ctx.fillText(String(k / division), g.x0 - 8, y);
    }
  }
  ctx.globalAlpha = 1;

  if (timeTags?.length) {
    ctx.save();
    ctx.strokeStyle = p.accent;
    ctx.fillStyle = p.accent;
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.setLineDash([4, 3]);
    for (const tag of timeTags) {
      const y = Math.round(g.beatToY(toFloat(tag.beat))) + 0.5;
      if (y < 0 || y > g.height) continue;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(g.x0, y);
      ctx.lineTo(g.x1, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(tag.name, g.x0 + 4, y - 2);
    }
    ctx.restore();
  }

  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, g.judgeY);
  ctx.lineTo(g.width, g.judgeY);
  ctx.stroke();
}

// Line-select stroke through grid pixel points.
export function drawStroke(ctx: CanvasRenderingContext2D, p: Palette, points: [number, number][]) {
  if (points.length < 2) return;
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
}

export function drawBox(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const [x, y, w, h] = [Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)];
  ctx.fillStyle = p.accent;
  ctx.globalAlpha = 0.12;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}
