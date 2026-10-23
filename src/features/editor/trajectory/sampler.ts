import { compileExpression } from './evaluator';
import { PRESET_MAP } from './presets';
import type { TrajectoryOptions, TrajectoryPoint } from './types';

export function sampleTrajectory(options: TrajectoryOptions): TrajectoryPoint[] {
  const preset = PRESET_MAP.get(options.presetId);
  const mode = options.mode;

  const exprX = options.presetId === 'custom' ? options.customExprX : (preset?.exprX ?? 't');
  const exprY = options.presetId === 'custom' ? options.customExprY : (preset?.exprY ?? '0');
  const exprR = options.presetId === 'custom' ? options.customExprR : (preset?.exprR ?? '1');
  const exprTheta =
    options.presetId === 'custom' ? options.customExprTheta : (preset?.exprTheta ?? 't');

  let fnX: (scope: Record<string, number>) => number = () => 0;
  let fnY: (scope: Record<string, number>) => number = () => 0;
  let fnR: (scope: Record<string, number>) => number = () => 0;
  let fnTheta: (scope: Record<string, number>) => number = () => 0;

  try {
    if (mode === 'parametric') {
      fnX = compileExpression(exprX);
      fnY = compileExpression(exprY);
    } else {
      fnR = compileExpression(exprR);
      fnTheta = compileExpression(exprTheta);
    }
  } catch (err) {
    console.warn('Trajectory compiler error:', err);
  }

  const tMin = options.tMin;
  const tMax = options.tMax;
  const tRange = tMax - tMin;

  const trimS = Math.min(Math.max(0, options.trimStart), 0.999);
  const trimE = Math.min(Math.max(trimS + 0.001, options.trimEnd), 1.0);

  const startT = tMin + tRange * trimS;
  const endT = tMin + tRange * trimE;

  const segCount = Math.max(2, Math.min(256, Math.round(options.segments) || 32));
  const rawCoords: { x: number; y: number }[] = [];

  const scope: Record<string, number> = {};
  if (preset) {
    for (const def of preset.paramDefs) {
      scope[def.name] = def.default;
    }
  }
  Object.assign(scope, options.params);

  for (let i = 0; i <= segCount; i++) {
    const u = i / segCount;
    const t = startT + u * (endT - startT);
    scope.t = t;

    let rx = 0;
    let ry = 0;

    if (mode === 'parametric') {
      rx = fnX(scope);
      ry = fnY(scope);
    } else {
      const r = fnR(scope);
      const theta = fnTheta(scope);
      rx = r * Math.cos(theta);
      ry = r * Math.sin(theta);
    }

    if (!Number.isFinite(rx)) rx = 0;
    if (!Number.isFinite(ry)) ry = 0;
    rawCoords.push({ x: rx, y: ry });
  }

  // 1. Scale
  const scaleX = Number.isFinite(options.scaleX) ? options.scaleX : 300;
  const scaleY = Number.isFinite(options.scaleY) ? options.scaleY : 300;
  const scaled = rawCoords.map((pt) => ({
    x: pt.x * scaleX,
    y: pt.y * scaleY,
  }));

  // 2. Rotate around origin (degrees)
  const rotation = Number.isFinite(options.rotation) ? options.rotation : 0;
  const rad = (rotation * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  const rotated = scaled.map((pt) => ({
    x: pt.x * cosR - pt.y * sinR,
    y: pt.x * sinR + pt.y * cosR,
  }));

  // 3. Translation / Start alignment
  let offsetX = Number.isFinite(options.centerX) ? options.centerX : 0;
  let offsetY = Number.isFinite(options.centerY) ? options.centerY : 0;
  if (options.alignStart && rotated.length > 0) {
    const startX = Number.isFinite(options.startX) ? options.startX : 0;
    const startY = Number.isFinite(options.startY) ? options.startY : 0;
    offsetX = startX - (rotated[0]?.x ?? 0);
    offsetY = startY - (rotated[0]?.y ?? 0);
  }

  const translated = rotated.map((pt) => {
    const tx = pt.x + offsetX;
    const ty = pt.y + offsetY;
    return {
      x: Number.isFinite(tx) ? Math.round(tx * 100) / 100 : 0,
      y: Number.isFinite(ty) ? Math.round(ty * 100) / 100 : 0,
    };
  });

  // 4. Tangent angle calculation & phase unwrapping
  const points: TrajectoryPoint[] = [];
  const rawAngles: number[] = [];

  for (let i = 0; i <= segCount; i++) {
    let vx = 0;
    let vy = 0;
    if (i === 0) {
      vx = translated[1].x - translated[0].x;
      vy = translated[1].y - translated[0].y;
    } else if (i === segCount) {
      vx = translated[segCount].x - translated[segCount - 1].x;
      vy = translated[segCount].y - translated[segCount - 1].y;
    } else {
      vx = translated[i + 1].x - translated[i - 1].x;
      vy = translated[i + 1].y - translated[i - 1].y;
    }

    if (Math.hypot(vx, vy) < 1e-5) {
      // Stationary / cusp: inherit previous raw angle if available
      rawAngles.push(rawAngles.length > 0 ? rawAngles[rawAngles.length - 1] : 0);
    } else {
      // In Phigros, canvas screen Y is flipped (-vy)
      const ang = (Math.atan2(-vy, vx) * 180) / Math.PI + options.tangentOffset;
      rawAngles.push(ang);
    }
  }

  // Phase unwrap angles to prevent 360-degree flip glitches
  let lastAngle = rawAngles[0] ?? 0;
  for (let i = 0; i <= segCount; i++) {
    if (!options.autoTangent) {
      points.push({
        x: translated[i].x,
        y: translated[i].y,
        angle: 0,
      });
      continue;
    }

    if (i === 0) {
      points.push({
        x: translated[0].x,
        y: translated[0].y,
        angle: Math.round(lastAngle * 10) / 10,
      });
      continue;
    }

    let delta = rawAngles[i] - (lastAngle % 360);
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;

    const continuousAngle = lastAngle + delta;
    lastAngle = continuousAngle;

    points.push({
      x: translated[i].x,
      y: translated[i].y,
      angle: Math.round(continuousAngle * 10) / 10,
    });
  }

  return points;
}
