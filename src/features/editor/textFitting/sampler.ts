import { rasterizeText } from './rasterizer';
import type { FittedNotePoint, TextFittingOptions } from './types';

export function sampleTextNotes(
  options: TextFittingOptions,
  linePos?: { x: number; y: number },
): FittedNotePoint[] {
  const { points: rawPoints, width } = rasterizeText(
    options.text,
    options.fontFamily,
    options.fontWeight,
    options.mode,
  );

  if (rawPoints.length === 0) {
    return [];
  }

  // Scale raw pixel coordinates to targetWidth
  const targetWidth = Math.max(50, Math.min(2000, options.targetWidth || 600));
  const scale = targetWidth / Math.max(1, width);
  const minSpacing = Math.max(8, Math.min(100, options.spacing || 24));

  // Downsample with 2D spatial grid for fast O(N) Poisson-disk-like spacing
  const cellSize = minSpacing;
  const grid = new Map<string, { x: number; y: number }>();
  const cellKey = (gx: number, gy: number) => `${gx},${gy}`;

  const sampled: { x: number; y: number }[] = [];

  for (const pt of rawPoints) {
    const sx = pt.x * scale;
    const sy = pt.y * scale;

    const gx = Math.floor(sx / cellSize);
    const gy = Math.floor(sy / cellSize);

    let tooClose = false;
    for (let dx = -1; dx <= 1 && !tooClose; dx++) {
      for (let dy = -1; dy <= 1 && !tooClose; dy++) {
        const neighbor = grid.get(cellKey(gx + dx, gy + dy));
        if (neighbor) {
          const distSq = (sx - neighbor.x) ** 2 + (sy - neighbor.y) ** 2;
          if (distSq < minSpacing * minSpacing) {
            tooClose = true;
          }
        }
      }
    }

    if (!tooClose) {
      const p = { x: sx, y: sy };
      grid.set(cellKey(gx, gy), p);
      sampled.push(p);
      if (sampled.length >= 800) break; // Hard cap safeguard
    }
  }

  if (sampled.length === 0) return [];

  // Order points based on timingMode
  let ordered: { x: number; y: number }[] = [];

  switch (options.timingMode) {
    case 'leftToRight':
      ordered = [...sampled].sort((a, b) => a.x - b.x || b.y - a.y);
      break;

    case 'topToBottom':
      ordered = [...sampled].sort((a, b) => b.y - a.y || a.x - b.x);
      break;

    case 'strokeOrder': {
      // Greedy nearest-neighbor stroke traversal
      const remaining = [...sampled];
      ordered = [];
      // Start with the leftmost-topmost point
      let currentIdx = 0;
      let bestScore = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const score = remaining[i].x - remaining[i].y * 0.5;
        if (score < bestScore) {
          bestScore = score;
          currentIdx = i;
        }
      }

      while (remaining.length > 0) {
        const [curr] = remaining.splice(currentIdx, 1);
        ordered.push(curr);
        if (remaining.length === 0) break;

        let nearestDist = Infinity;
        let nearestIdx = 0;
        for (let i = 0; i < remaining.length; i++) {
          const d2 = (curr.x - remaining[i].x) ** 2 + (curr.y - remaining[i].y) ** 2;
          if (d2 < nearestDist) {
            nearestDist = d2;
            nearestIdx = i;
          }
        }
        currentIdx = nearestIdx;
      }
      break;
    }

    case 'random': {
      // Deterministic shuffle
      ordered = [...sampled];
      for (let i = ordered.length - 1; i > 0; i--) {
        const j = Math.floor(Math.abs(Math.sin(i * 12.9898 + 78.233)) * (i + 1));
        const temp = ordered[i];
        ordered[i] = ordered[j];
        ordered[j] = temp;
      }
      break;
    }

    case 'simultaneous':
    default:
      ordered = [...sampled].sort((a, b) => a.x - b.x);
      break;
  }

  // Apply rotation
  const rad = ((options.rotation || 0) * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);

  const rotated = ordered.map((pt) => ({
    x: pt.x * cosR - pt.y * sinR,
    y: pt.x * sinR + pt.y * cosR,
  }));

  // Apply translation offset
  let offsetX = Number.isFinite(options.centerX) ? options.centerX : 0;
  let offsetY = Number.isFinite(options.centerY) ? options.centerY : 0;

  if (options.alignToLine && linePos) {
    offsetX += linePos.x;
    offsetY += linePos.y;
  }

  const startBeat = Number.isFinite(options.startBeat) ? options.startBeat : 0;
  const endBeat = Number.isFinite(options.endBeat) ? Math.max(startBeat, options.endBeat) : startBeat;
  const beatSpan = endBeat - startBeat;
  const totalNotes = rotated.length;

  return rotated.map((pt, idx) => {
    let noteBeat = startBeat;
    if (options.timingMode !== 'simultaneous' && totalNotes > 1 && beatSpan > 0) {
      noteBeat = startBeat + (beatSpan * idx) / (totalNotes - 1);
    }

    return {
      x: Math.round((pt.x + offsetX) * 10) / 10,
      y: Math.round((pt.y + offsetY) * 10) / 10,
      beat: Math.round(noteBeat * 1000) / 1000,
      order: idx,
    };
  });
}
