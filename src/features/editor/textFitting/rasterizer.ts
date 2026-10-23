import { zhangSuenThinning } from './skeleton';
import type { TextFittingMode } from './types';

export interface RasterizedGlyphData {
  points: { x: number; y: number }[]; // Raw pixel coordinates within bounding box
  width: number;
  height: number;
  aspectRatio: number;
}

export function rasterizeText(
  text: string,
  fontFamily: string,
  fontWeight: 'normal' | 'bold',
  mode: TextFittingMode,
): RasterizedGlyphData {
  const trimmed = text.trim();
  if (!trimmed) {
    return { points: [], width: 1, height: 1, aspectRatio: 1 };
  }

  // Create offscreen canvas with large resolution for high fidelity
  const fontSize = 120;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { points: [], width: 1, height: 1, aspectRatio: 1 };
  }

  ctx.font = `${fontWeight === 'bold' ? 'bold ' : ''}${fontSize}px "${fontFamily}", sans-serif`;
  ctx.textBaseline = 'alphabetic';

  const metrics = ctx.measureText(trimmed);
  const textWidth = Math.ceil(metrics.width);
  const textHeight = Math.ceil(fontSize * 1.5);

  canvas.width = Math.max(32, textWidth + 40);
  canvas.height = Math.max(32, textHeight + 40);

  // Redraw after resizing canvas
  ctx.font = `${fontWeight === 'bold' ? 'bold ' : ''}${fontSize}px "${fontFamily}", sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillText(trimmed, 20, fontSize + 10);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // Find tight bounding box of alpha channel (> 120)
  let minX = canvas.width;
  let maxX = -1;
  let minY = canvas.height;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const alpha = data[(y * canvas.width + x) * 4 + 3];
      if (alpha > 120) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { points: [], width: 1, height: 1, aspectRatio: 1 };
  }

  // Add 2px border padding for thinning boundary stability
  const pad = 2;
  const cropW = maxX - minX + 1 + pad * 2;
  const cropH = maxY - minY + 1 + pad * 2;
  const binaryGrid = new Uint8Array(cropW * cropH);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const alpha = data[(y * canvas.width + x) * 4 + 3];
      if (alpha > 120) {
        const destIdx = (y - minY + pad) * cropW + (x - minX + pad);
        binaryGrid[destIdx] = 1;
      }
    }
  }

  let finalGrid: Uint8Array;

  if (mode === 'skeleton') {
    finalGrid = zhangSuenThinning(binaryGrid, cropW, cropH);
  } else if (mode === 'contour') {
    finalGrid = new Uint8Array(cropW * cropH);
    for (let y = 1; y < cropH - 1; y++) {
      for (let x = 1; x < cropW - 1; x++) {
        const idx = y * cropW + x;
        if (!binaryGrid[idx]) continue;
        // Check if any of 4 orthogonal neighbors is 0
        const n = binaryGrid[(y - 1) * cropW + x];
        const s = binaryGrid[(y + 1) * cropW + x];
        const w = binaryGrid[y * cropW + (x - 1)];
        const e = binaryGrid[y * cropW + (x + 1)];
        if (!n || !s || !w || !e) {
          finalGrid[idx] = 1;
        }
      }
    }
  } else {
    // Fill mode
    finalGrid = binaryGrid;
  }

  // Extract pixel coordinates relative to center
  const points: { x: number; y: number }[] = [];
  const cx = cropW / 2;
  const cy = cropH / 2;

  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      if (finalGrid[y * cropW + x]) {
        // Canvas Y is down, in Phigros playfield Y is up, so negate Y
        points.push({
          x: x - cx,
          y: -(y - cy),
        });
      }
    }
  }

  return {
    points,
    width: cropW,
    height: cropH,
    aspectRatio: cropW / Math.max(1, cropH),
  };
}
