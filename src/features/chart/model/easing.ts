import type { Easing } from './types';

type Curve = (t: number) => number;

const C1 = 1.70158;
const C2 = C1 * 1.525;
const E1 = (2 * Math.PI) / 3;
const E2 = (2 * Math.PI) / 4.5;

function bounceOut(t: number) {
  const n = 7.5625;
  if (t < 1 / 2.75) return n * t * t;
  if (t < 2 / 2.75) return n * (t -= 1.5 / 2.75) * t + 0.75;
  if (t < 2.5 / 2.75) return n * (t -= 2.25 / 2.75) * t + 0.9375;
  return n * (t -= 2.625 / 2.75) * t + 0.984375;
}

// RPE easing table; index = id − 1.
const CURVES: Curve[] = [
  (t) => t,
  (t) => Math.sin((t * Math.PI) / 2),
  (t) => 1 - Math.cos((t * Math.PI) / 2),
  (t) => 1 - (1 - t) ** 2,
  (t) => t ** 2,
  (t) => (1 - Math.cos(Math.PI * t)) / 2,
  (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  (t) => 1 - (1 - t) ** 3,
  (t) => t ** 3,
  (t) => 1 - (1 - t) ** 4,
  (t) => t ** 4,
  (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
  (t) => 1 - (1 - t) ** 5,
  (t) => t ** 5,
  (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  (t) => Math.sqrt(1 - (t - 1) ** 2),
  (t) => 1 - Math.sqrt(Math.abs(1 - t * t)),
  (t) => 1 + (C1 + 1) * (t - 1) ** 3 + C1 * (t - 1) ** 2,
  (t) => (C1 + 1) * t ** 3 - C1 * t * t,
  (t) =>
    t < 0.5 ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2 : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2,
  (t) =>
    t < 0.5
      ? ((2 * t) ** 2 * ((C2 + 1) * 2 * t - C2)) / 2
      : ((2 * t - 2) ** 2 * ((C2 + 1) * (2 * t - 2) + C2) + 2) / 2,
  (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * E1) + 1),
  (t) => (t === 0 || t === 1 ? t : -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * E1)),
  bounceOut,
  (t) => 1 - bounceOut(1 - t),
  (t) => (t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2),
  (t) =>
    t === 0 || t === 1
      ? t
      : t < 0.5
        ? -(2 ** (20 * t - 10) * Math.sin((20 * t - 11.125) * E2)) / 2
        : (2 ** (-20 * t + 10) * Math.sin((20 * t - 11.125) * E2)) / 2 + 1,
];

export const EASING_NAMES = [
  'Linear',
  'Out Sine',
  'In Sine',
  'Out Quad',
  'In Quad',
  'In Out Sine',
  'In Out Quad',
  'Out Cubic',
  'In Cubic',
  'Out Quart',
  'In Quart',
  'In Out Cubic',
  'In Out Quart',
  'Out Quint',
  'In Quint',
  'Out Expo',
  'In Expo',
  'Out Circ',
  'In Circ',
  'Out Back',
  'In Back',
  'In Out Circ',
  'In Out Back',
  'Out Elastic',
  'In Elastic',
  'Out Bounce',
  'In Bounce',
  'In Out Bounce',
  'In Out Elastic',
];

function cubicBezier(t: number, [x1, y1, x2, y2]: [number, number, number, number]) {
  const at = (s: number, a: number, b: number) =>
    3 * s * (1 - s) ** 2 * a + 3 * s * s * (1 - s) * b + s ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid, x1, x2) < t) lo = mid;
    else hi = mid;
  }
  return at((lo + hi) / 2, y1, y2);
}

// Maps progress 0–1 through an easing (with optional clip).
export function ease(easing: Easing, t: number) {
  if (easing.kind === 'bezier') return cubicBezier(t, easing.points);
  const curve = CURVES[easing.id - 1] ?? CURVES[0];
  const [l, r] = easing.clip ?? [0, 1];
  if (l === 0 && r === 1) return curve(t);
  const base = curve(l);
  const range = curve(r) - base;
  return Math.abs(range) < 1e-12 ? t : (curve(l + (r - l) * t) - base) / range;
}

export const isLinear = (easing: Easing) =>
  easing.kind === 'preset' && easing.id === 1 && !easing.clip;
