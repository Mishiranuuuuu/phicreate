// Types for the Curve Trajectory Generator for Judgement Lines.

export type CurveMode = 'parametric' | 'polar';

export type CurveCategory = 'basic' | 'waves' | 'spirals' | 'curves' | 'custom';

export interface ParamDef {
  name: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface CurvePreset {
  id: string;
  name: string;
  category: CurveCategory;
  mode: CurveMode;
  paramDefs: ParamDef[];
  defaultScaleX: number;
  defaultScaleY: number;
  defaultSegments: number;
  defaultTMin: number;
  defaultTMax: number;
  // Parametric expressions (t, pi, tau, e, and params allowed)
  exprX?: string;
  exprY?: string;
  // Polar expressions
  exprR?: string;
  exprTheta?: string;
  isClosed?: boolean;
  description?: string;
}

export interface TrajectoryOptions {
  presetId: string;
  mode: CurveMode;
  customExprX: string;
  customExprY: string;
  customExprR: string;
  customExprTheta: string;
  params: Record<string, number>;
  tMin: number;
  tMax: number;
  segments: number;
  trimStart: number; // 0..1
  trimEnd: number; // 0..1
  scaleX: number;
  scaleY: number;
  rotation: number; // degrees
  centerX: number;
  centerY: number;
  alignStart: boolean;
  startX: number;
  startY: number;
  autoTangent: boolean;
  tangentOffset: number; // degrees (e.g. 0 = tangent, 90 = normal)
  startBeat: number;
  endBeat: number;
  targetLineId: string | null;
  targetLayerId: string | null;
}

export interface TrajectoryPoint {
  x: number;
  y: number;
  angle: number; // unwrapped continuous degrees
}
