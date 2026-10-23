// Samples notes and preview path along curve trajectories.

import { evaluateCurveX } from './evaluator';
import type { CurveFillOptions, SampledCurveNote } from './types';

/**
 * Samples discrete note positions according to the chosen density and stepping.
 */
export function sampleCurveNotes(options: CurveFillOptions): SampledCurveNote[] {
  const startBeat = Math.max(0, options.startBeat);
  const endBeat = Math.max(startBeat + 0.001, options.endBeat);
  const duration = endBeat - startBeat;

  const rawBeats: number[] = [];

  if (options.densityMode === 'snap') {
    const snap = Math.max(1, Math.min(192, Math.round(options.snapDivision || 16)));
    const firstIndex = Math.ceil(startBeat * snap);
    const lastIndex = Math.floor(endBeat * snap);

    if (options.includeStart && Math.abs(firstIndex / snap - startBeat) > 1e-4) {
      rawBeats.push(startBeat);
    }

    for (let i = firstIndex; i <= lastIndex; i++) {
      const b = i / snap;
      if (b >= startBeat - 1e-5 && b <= endBeat + 1e-5) {
        if (!rawBeats.length || Math.abs(rawBeats[rawBeats.length - 1] - b) > 1e-5) {
          rawBeats.push(b);
        }
      }
    }

    if (options.includeEnd && Math.abs(rawBeats[rawBeats.length - 1] - endBeat) > 1e-4) {
      rawBeats.push(endBeat);
    }

    if (!options.includeStart && rawBeats.length > 0 && Math.abs(rawBeats[0] - startBeat) < 1e-5) {
      rawBeats.shift();
    }
    if (
      !options.includeEnd &&
      rawBeats.length > 0 &&
      Math.abs(rawBeats[rawBeats.length - 1] - endBeat) < 1e-5
    ) {
      rawBeats.pop();
    }
  } else {
    // Count mode
    const count = Math.max(2, Math.min(500, Math.round(options.totalCount || 16)));
    const incStart = options.includeStart;
    const incEnd = options.includeEnd;

    for (let i = 0; i < count; i++) {
      let t = 0;
      if (incStart && incEnd) {
        t = count > 1 ? i / (count - 1) : 0;
      } else if (incStart && !incEnd) {
        t = i / count;
      } else if (!incStart && incEnd) {
        t = (i + 1) / count;
      } else {
        t = (i + 1) / (count + 1);
      }
      rawBeats.push(startBeat + t * duration);
    }
  }

  // Safety cap to avoid freezing browser with accidental massive loops
  const safeBeats = rawBeats.slice(0, 1000);

  return safeBeats.map((b, idx) => {
    const t = Math.max(0, Math.min(1, (b - startBeat) / duration));
    const x = evaluateCurveX(t, options);

    let above = true;
    if (options.side === 'above') {
      above = true;
    } else if (options.side === 'below') {
      above = false;
    } else if (options.side === 'alternate') {
      above = idx % 2 === 0;
    }

    const res: SampledCurveNote = {
      beat: Math.round(b * 960) / 960,
      x: Math.round(x * 10) / 10,
      type: options.noteType,
      above,
      fake: !!options.fake,
      speed: Number.isFinite(options.speed) ? options.speed : 1,
      alpha: Number.isFinite(options.alpha) ? options.alpha : 255,
      size: Number.isFinite(options.size) ? options.size : 1,
    };

    if (options.noteType === 'hold') {
      const holdLen = Math.max(0.05, options.holdDuration || 0.5);
      res.holdEndBeat = Math.round((b + holdLen) * 960) / 960;
    }

    return res;
  });
}

/**
 * Samples a continuous smooth polyline for previewing the curve path.
 */
export function sampleCurvePreviewPath(
  options: CurveFillOptions,
  steps = 80,
): { t: number; beat: number; lineX: number }[] {
  const startBeat = Math.max(0, options.startBeat);
  const endBeat = Math.max(startBeat + 0.001, options.endBeat);
  const duration = endBeat - startBeat;

  const points: { t: number; beat: number; lineX: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const beat = startBeat + t * duration;
    const lineX = evaluateCurveX(t, options);
    points.push({ t, beat, lineX });
  }
  return points;
}
