// Types for Curve Note Filling (填充曲线音符).

import type { NoteType } from '@/features/chart/model/types';

export type CurveFillMode = 'endpoints' | 'math';

export type CurveFillDensityMode = 'snap' | 'count';

export type CurveFillSide = 'above' | 'below' | 'alternate';

export type WaveType = 'none' | 'sine' | 'cosine' | 'triangle';

export type WaveEnvelope = 'none' | 'pinned' | 'fadeIn' | 'fadeOut';

export type MathPresetId =
  | 'sine'
  | 'cosine'
  | 'zigzag'
  | 'parabola'
  | 'sigmoid'
  | 'rebound'
  | 'damped'
  | 'custom';

export interface CurveFillOptions {
  mode: CurveFillMode;
  targetLineId: string | null;

  // Beat range
  startBeat: number;
  endBeat: number;

  // Endpoints mode (Mode A)
  startX: number;
  endX: number;
  easingId: number; // 1..29
  isBezier: boolean;
  bezierPoints: [number, number, number, number];

  // Wave modulation on top of easing
  waveType: WaveType;
  waveAmp: number;
  waveCycles: number;
  wavePhase: number; // degrees
  waveEnvelope: WaveEnvelope;

  // Math Presets mode (Mode B)
  mathPresetId: MathPresetId;
  mathCenterX: number;
  mathAmp: number;
  mathCycles: number;
  mathPhase: number; // degrees
  customExpr: string;

  // Density & stepping
  densityMode: CurveFillDensityMode;
  snapDivision: number; // e.g. 16 for 1/16th beat
  totalCount: number; // e.g. 32 notes
  includeStart: boolean;
  includeEnd: boolean;

  // Note properties
  noteType: NoteType; // 'drag' | 'tap' | 'flick' | 'hold'
  holdDuration: number; // in beats, when noteType === 'hold'
  side: CurveFillSide;
  fake: boolean;
  speed: number;
  alpha: number;
  size: number;
}

export interface SampledCurveNote {
  beat: number;
  x: number;
  type: NoteType;
  above: boolean;
  holdEndBeat?: number;
  fake: boolean;
  speed: number;
  alpha: number;
  size: number;
}

export interface CurveFillGhost {
  targetLineId: string | null;
  notes: {
    x: number;
    y: number;
    beat: number;
    lineX: number;
    type: NoteType;
    above: boolean;
  }[];
  pathPoints: { x: number; y: number }[];
}
