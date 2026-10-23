// Evaluates note X positions along curve trajectories.

import { ease } from '@/features/chart/model/easing';
import type { Easing } from '@/features/chart/model/types';
import { compileExpression } from '@/features/editor/trajectory/evaluator';
import type { CurveFillOptions } from './types';

// Cache for compiled custom expressions
let cachedCustomExpr = '';
let cachedCompiledFn: ((scope: Record<string, number>) => number) | null = null;

function getCompiledCustom(expr: string) {
  if (expr === cachedCustomExpr && cachedCompiledFn) {
    return cachedCompiledFn;
  }
  try {
    cachedCustomExpr = expr;
    cachedCompiledFn = compileExpression(expr);
    return cachedCompiledFn;
  } catch {
    return () => 0;
  }
}

/**
 * Evaluates the X offset along the judge line for normalized parameter t in [0, 1].
 */
export function evaluateCurveX(t: number, options: CurveFillOptions): number {
  const clampedT = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));

  if (options.mode === 'endpoints') {
    // Mode A: Easing + optional Wave modulation
    const activeEasing: Easing = options.isBezier
      ? { kind: 'bezier', points: options.bezierPoints }
      : { kind: 'preset', id: options.easingId || 1 };

    let easedT = clampedT;
    try {
      easedT = ease(activeEasing, clampedT);
    } catch {
      easedT = clampedT;
    }

    const startX = Number.isFinite(options.startX) ? options.startX : 0;
    const endX = Number.isFinite(options.endX) ? options.endX : 0;
    const baseLineX = startX + (endX - startX) * easedT;

    if (options.waveType === 'none' || !options.waveAmp) {
      return baseLineX;
    }

    const cycles = Math.max(0.1, Number.isFinite(options.waveCycles) ? options.waveCycles : 1);
    const phaseRad = ((options.wavePhase ?? 0) * Math.PI) / 180;
    const theta = 2 * Math.PI * cycles * clampedT + phaseRad;

    let rawWave = 0;
    if (options.waveType === 'sine') {
      rawWave = Math.sin(theta);
    } else if (options.waveType === 'cosine') {
      rawWave = Math.cos(theta);
    } else if (options.waveType === 'triangle') {
      const normalizedCycle = ((clampedT * cycles + (options.wavePhase ?? 0) / 360) % 1 + 1) % 1;
      rawWave = 4 * Math.abs(normalizedCycle - 0.5) - 1;
    }

    let env = 1;
    if (options.waveEnvelope === 'pinned') {
      env = Math.sin(Math.PI * clampedT);
    } else if (options.waveEnvelope === 'fadeIn') {
      env = clampedT;
    } else if (options.waveEnvelope === 'fadeOut') {
      env = 1 - clampedT;
    }

    const waveX = (options.waveAmp || 0) * rawWave * env;
    const finalX = baseLineX + waveX;
    return Number.isFinite(finalX) ? finalX : baseLineX;
  }

  // Mode B: Mathematical presets & custom formulas
  const centerX = Number.isFinite(options.mathCenterX) ? options.mathCenterX : 0;
  const amp = Number.isFinite(options.mathAmp) ? options.mathAmp : 200;
  const cycles = Math.max(0.1, Number.isFinite(options.mathCycles) ? options.mathCycles : 1);
  const phaseRad = ((options.mathPhase ?? 0) * Math.PI) / 180;
  const theta = 2 * Math.PI * cycles * clampedT + phaseRad;

  switch (options.mathPresetId) {
    case 'sine':
      return centerX + amp * Math.sin(theta);

    case 'cosine':
      return centerX + amp * Math.cos(theta);

    case 'zigzag': {
      const normalizedCycle = ((clampedT * cycles + (options.mathPhase ?? 0) / 360) % 1 + 1) % 1;
      const tri = 4 * Math.abs(normalizedCycle - 0.5) - 1;
      return centerX + amp * tri;
    }

    case 'parabola': {
      // Sweeping arch: starts at 0, reaches amp at t=0.5, returns to 0 at t=1
      const arch = 4 * clampedT * (1 - clampedT);
      return centerX + amp * arch;
    }

    case 'sigmoid': {
      // S-curve logistic transition centered at t=0.5
      const k = 10 * cycles;
      const sig = (1 / (1 + Math.exp(-k * (clampedT - 0.5))) - 0.5) * 2;
      return centerX + amp * sig;
    }

    case 'rebound': {
      // Multi-bounce arches
      const bounce = Math.abs(Math.sin(Math.PI * cycles * clampedT));
      return centerX + amp * bounce;
    }

    case 'damped': {
      // Converging oscillation towards center
      const decay = 1 - clampedT;
      return centerX + amp * decay * Math.sin(theta);
    }

    case 'custom': {
      if (!options.customExpr.trim()) return centerX;
      try {
        const fn = getCompiledCustom(options.customExpr);
        const res = fn({
          t: clampedT,
          tNorm: clampedT,
          amp,
          cycles,
          phase: options.mathPhase ?? 0,
          centerX,
          pi: Math.PI,
          tau: Math.PI * 2,
          e: Math.E,
        });
        return Number.isFinite(res) ? res : centerX;
      } catch {
        return centerX;
      }
    }

    default:
      return centerX;
  }
}
