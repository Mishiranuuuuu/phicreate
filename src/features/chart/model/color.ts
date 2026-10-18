import type { Color } from './types';

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

export const toHex = (c: Color) =>
  '#' + c.map((v) => clamp(v).toString(16).padStart(2, '0')).join('');

export const toCss = (c: Color) => `rgb(${c.map(clamp).join(',')})`;

export const isColor = (v: unknown): v is Color =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));

// Accepts "#rgb", "#rrggbb" or "r, g, b".
export function parseColor(text: string): Color | null {
  const s = text.trim();
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((h) => h + h).join('') : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Color;
  }
  const parts = s
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? (parts.map(clamp) as Color) : null;
}
