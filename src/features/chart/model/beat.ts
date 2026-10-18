import { parseNumber } from '@/lib/number';
import type { Beat } from './types';

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a) || 1);

export function reduce([w, n, d]: Beat): Beat {
  if (d < 0) [n, d, w] = [-n, -d, -w];
  const total = w * d + n;
  const whole = Math.floor(total / d);
  const num = total - whole * d;
  if (num === 0) return [whole, 0, 1];
  const g = gcd(num, d);
  return [whole, num / g, d / g];
}

export const toFloat = ([w, n, d]: Beat) => w + n / d;

// Snaps to the nearest 1/density.
export const fromFloat = (value: number, density: number): Beat =>
  reduce([0, Math.round(value * density), density]);

export const add = (a: Beat, b: Beat): Beat =>
  reduce([a[0] + b[0], a[1] * b[2] + b[1] * a[2], a[2] * b[2]]);

export const sub = (a: Beat, b: Beat): Beat =>
  reduce([a[0] - b[0], a[1] * b[2] - b[1] * a[2], a[2] * b[2]]);

export const cmp = (a: Beat, b: Beat) => (a[0] * a[2] + a[1]) * b[2] - (b[0] * b[2] + b[1]) * a[2];

export const eq = (a: Beat, b: Beat) => cmp(a, b) === 0;

export const ZERO: Beat = [0, 0, 1];

export const format = ([w, n, d]: Beat) => (n ? `${w}:${n}/${d}` : `${w}`);

// Accepts "w", "w:n/d", a decimal or arithmetic.
export function parse(text: string): Beat | null {
  const m = text.trim().match(/^(-?\d+)(?::(\d+)\/(\d+))?$/);
  if (m) {
    const d = m[3] ? Number(m[3]) : 1;
    return d > 0 ? reduce([Number(m[1]), m[2] ? Number(m[2]) : 0, d]) : null;
  }
  const v = parseNumber(text);
  return v === null ? null : fromFloat(v, 960);
}
