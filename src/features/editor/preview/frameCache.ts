import { toCss } from '@/features/chart/model/color';
import type { Color } from '@/features/chart/model/types';

// Downscaled (mip) and tinted copies of frames, so drawing many images stays cheap.

const BUDGET = 192 * 1024 * 1024;
const MAX_SIDE = 4096;
// Tinted copies kept per frame (different colors or levels).
const TINT_SLOTS = 4;

interface Tint {
  key: string;
  canvas: HTMLCanvasElement;
}

interface Entry {
  // mips[k] is the source halved k + 1 times.
  mips: HTMLCanvasElement[];
  tints: Tint[];
  bytes: number;
}

// Least recently used first.
const entries = new Map<object, Entry>();
let totalBytes = 0;

function entryFor(src: object) {
  let entry = entries.get(src);
  if (entry) entries.delete(src);
  else entry = { mips: [], tints: [], bytes: 0 };
  entries.set(src, entry);
  return entry;
}

function track(entry: Entry, delta: number) {
  entry.bytes += delta;
  totalBytes += delta;
}

function evict(keep: Entry) {
  for (const [src, entry] of entries) {
    if (totalBytes <= BUDGET) return;
    if (entry !== keep) forgetFrame(src);
  }
}

function sizeCanvas(entry: Entry, canvas: HTMLCanvasElement, w: number, h: number) {
  if (canvas.width === w && canvas.height === h) return;
  track(entry, (w * h - canvas.width * canvas.height) * 4);
  canvas.width = w;
  canvas.height = h;
}

function newCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 0;
  return canvas;
}

function mip(entry: Entry, src: CanvasImageSource, w: number, h: number, level: number) {
  for (let k = entry.mips.length; k < level; k++) {
    const from = k ? entry.mips[k - 1] : src;
    const canvas = newCanvas();
    sizeCanvas(entry, canvas, Math.max(1, w >> (k + 1)), Math.max(1, h >> (k + 1)));
    const c = canvas.getContext('2d')!;
    c.imageSmoothingQuality = 'high';
    c.drawImage(from, 0, 0, canvas.width, canvas.height);
    entry.mips.push(canvas);
  }
  return entry.mips[level - 1];
}

function tint(dst: HTMLCanvasElement, src: CanvasImageSource, color: Color) {
  const c = dst.getContext('2d')!;
  const { width: w, height: h } = dst;
  c.globalCompositeOperation = 'copy';
  c.drawImage(src, 0, 0, w, h);
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = toCss(color);
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(src, 0, 0, w, h);
}

const clampSide = (v: number) => Math.max(1, Math.min(MAX_SIDE, Math.ceil(v)));

/**
 * Source to draw for a frame of srcW x srcH shown at pxW x pxH device pixels, tinted by color.
 * Still frames get cached mips and tints; frames of a `live` source (e.g. a video) are re-tinted
 * each call into a canvas kept per source.
 */
export function frameFor(
  src: CanvasImageSource,
  srcW: number,
  srcH: number,
  pxW: number,
  pxH: number,
  color: Color,
  live?: object,
): CanvasImageSource {
  const white = color.every((v) => v >= 255);
  if (live) {
    if (white) return src;
    const entry = entryFor(live);
    const slot = (entry.tints[0] ??= { key: 'live', canvas: newCanvas() });
    sizeCanvas(entry, slot.canvas, clampSide(Math.min(pxW, srcW)), clampSide(Math.min(pxH, srcH)));
    tint(slot.canvas, src, color);
    evict(entry);
    return slot.canvas;
  }

  const ratio = Math.min(srcW / Math.max(1, pxW), srcH / Math.max(1, pxH));
  const level = ratio >= 2 ? Math.min(12, Math.floor(Math.log2(ratio))) : 0;
  if (white && !level) return src;
  const entry = entryFor(src);
  const base = level ? mip(entry, src, srcW, srcH, level) : src;
  if (white) {
    evict(entry);
    return base;
  }
  const key = `${level}|${color.join(',')}`;
  const { tints } = entry;
  const hit = tints.findIndex((s) => s.key === key);
  if (hit >= 0) {
    const [slot] = tints.splice(hit, 1);
    tints.unshift(slot);
    return slot.canvas;
  }
  const slot = tints.length >= TINT_SLOTS ? tints.pop()! : { key, canvas: newCanvas() };
  slot.key = key;
  // Level 0 is under 2x the draw size, so it tints at source size.
  const w = level ? (base as HTMLCanvasElement).width : clampSide(srcW);
  const h = level ? (base as HTMLCanvasElement).height : clampSide(srcH);
  sizeCanvas(entry, slot.canvas, w, h);
  tint(slot.canvas, base, color);
  tints.unshift(slot);
  evict(entry);
  return slot.canvas;
}

// Drops cached copies of a frame (released or replaced).
export function forgetFrame(src: object) {
  const entry = entries.get(src);
  if (!entry) return;
  for (const c of [...entry.mips, ...entry.tints.map((s) => s.canvas)]) c.width = c.height = 0;
  totalBytes -= entry.bytes;
  entries.delete(src);
}
