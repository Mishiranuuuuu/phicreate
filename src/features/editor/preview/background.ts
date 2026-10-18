import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/features/chart/model/defaults';

const BLUR_PX = 12;

let frames: { sharp: HTMLCanvasElement; blurred: HTMLCanvasElement } | null = null;
let generation = 0;

// Pre-renders the illustration, cover-fit (sharp and blurred), at canvas resolution.
export async function setBackground(blob?: Blob) {
  const id = ++generation;
  frames = null;
  if (!blob) return;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return;
  }
  if (id !== generation) return;
  frames = { sharp: render(bitmap, 0), blurred: render(bitmap, BLUR_PX) };
  bitmap.close();
}

function render(bitmap: ImageBitmap, blur: number) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const s = Math.max(CANVAS_WIDTH / bitmap.width, CANVAS_HEIGHT / bitmap.height);
  // Overscan so blurred edges stay opaque.
  const pad = blur * 2;
  const w = bitmap.width * s + pad * 2;
  const h = bitmap.height * s + pad * 2;
  if (blur) ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(bitmap, (CANVAS_WIDTH - w) / 2, (CANVAS_HEIGHT - h) / 2, w, h);
  return canvas;
}

export const getBackground = (blur = true) => (blur ? frames?.blurred : frames?.sharp) ?? null;
