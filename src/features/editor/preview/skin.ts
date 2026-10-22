import type { Color, NoteType } from '@/features/chart/model/types';

// Loaded once, drawn when ready.
const BASE = `${import.meta.env.BASE_URL}assets/phigros/Texture/`;

export const HIT_FRAMES = 31;
export const HIT_FRAME_SECONDS = 0.015;
export const HIT_DURATION = HIT_FRAMES * HIT_FRAME_SECONDS;

const HEADS: Record<NoteType, [normal: string, highlight: string]> = {
  tap: ['Tap', 'TapHL'],
  drag: ['Drag', 'DragHL'],
  flick: ['Flick', 'FlickHL'],
  hold: ['HoldHead', 'HoldHeadHL'],
};

const NAMES = [
  ...Object.values(HEADS).flat(),
  'Pause',
  'HoldBody',
  'HoldBodyHL',
  'HoldTail',
  'HoldTailHL',
  ...Array.from({ length: HIT_FRAMES }, (_, i) => `img-${i + 1}`),
];

const images = new Map<string, HTMLImageElement>();
const tints = new Map<string, HTMLCanvasElement>();
let loading: Promise<void> | null = null;

export function loadSkin() {
  loading ??= Promise.all(
    NAMES.map(async (name) => {
      const img = new Image();
      img.src = `${BASE}${name}.${name === 'Pause' ? 'svg' : 'png'}`;
      try {
        await img.decode();
        images.set(name, img);
      } catch {
        // Missing texture: renderer falls back to flat shapes.
      }
    }),
  ).then(() => undefined);
  return loading;
}

export const getImage = (name: string) => images.get(name);

const hasTint = (tint?: Color): tint is Color =>
  !!tint && (tint[0] !== 255 || tint[1] !== 255 || tint[2] !== 255);

export const headImage = (type: NoteType, highlight: boolean, tint?: Color) => {
  const name = HEADS[type][highlight ? 1 : 0];
  return hasTint(tint) ? tinted(name, tint) : images.get(name);
};

export const holdImages = (highlight: boolean, tint?: Color) => {
  const get = (name: string) => (hasTint(tint) ? tinted(name, tint) : images.get(name));
  return {
    body: get(highlight ? 'HoldBodyHL' : 'HoldBody'),
    end: get(highlight ? 'HoldTailHL' : 'HoldTail'),
    head: get(highlight ? 'HoldHeadHL' : 'HoldHead'),
  };
};

// Multiplies a texture by a color (cached).
export function tinted(name: string, [r, g, b]: [number, number, number]) {
  const img = images.get(name);
  if (!img) return null;
  const key = `${name}:${r},${g},${b}`;
  let canvas = tints.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, 0, 0);
    tints.set(key, canvas);
  }
  return canvas;
}
