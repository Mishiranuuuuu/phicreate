import type { Segment } from './fit';

// Sampled curve: `at[k]` = value at times[k], `before[k]` = value just before times[k].
export interface Samples {
  times: number[];
  at: number[];
  before: number[];
}

// Greedy piecewise-linear fit within eps (slope window); jumps always cut.
// Samples of a different `kind` never share a segment (it ends one sample early).
export function simplify(
  { times, at, before }: Samples,
  eps: number,
  kind?: (v: number) => unknown,
): Segment[] {
  const out: Segment[] = [];
  let i = 0;
  while (i < times.length - 1) {
    const t0 = times[i];
    const v0 = at[i];
    let lo = -Infinity;
    let hi = Infinity;
    let j = i;
    for (let k = i + 1; k < times.length; k++) {
      if (kind && k > i + 1 && kind(before[k]) !== kind(v0)) break;
      const dt = times[k] - t0;
      const nlo = Math.max(lo, (before[k] - eps - v0) / dt);
      const nhi = Math.min(hi, (before[k] + eps - v0) / dt);
      if (nlo > nhi) break;
      [lo, hi, j] = [nlo, nhi, k];
      if (Math.abs(at[k] - before[k]) > eps) break;
    }
    const dt = times[j] - t0;
    const slope = Math.min(hi, Math.max(lo, (before[j] - v0) / dt));
    out.push({ start: t0, end: times[j], from: v0, to: v0 + slope * dt });
    i = j;
  }
  return out;
}

const valueIn = (s: Segment, t: number) =>
  s.end > s.start ? s.from + ((s.to - s.from) * (t - s.start)) / (s.end - s.start) : s.to;

// Splits contiguous piece lists at each other's breakpoints so they share boundaries.
export function align(tracks: Segment[][]): Segment[][] {
  const cuts = [...new Set(tracks.flatMap((t) => t.flatMap((s) => [s.start, s.end])))].sort(
    (a, b) => a - b,
  );
  return tracks.map((track) => {
    const out: Segment[] = [];
    let k = 0;
    for (let c = 0; c < cuts.length - 1; c++) {
      const [a, b] = [cuts[c], cuts[c + 1]];
      while (k < track.length - 1 && track[k].end <= a) k++;
      const s = track[k];
      if (!s) break;
      out.push({ start: a, end: b, from: valueIn(s, a), to: valueIn(s, b) });
    }
    return out;
  });
}

// Samples `value` on a grid of `step` from `start` to `end`.
export function sample(start: number, end: number, step: number, value: (t: number) => number) {
  const times: number[] = [];
  end = Math.max(end, start + step);
  const n = Math.max(1, Math.ceil((end - start) / step));
  for (let k = 0; k <= n; k++) times.push(Math.min(end, start + k * step));
  return {
    times,
    at: times.map((t) => value(t)),
    before: times.map((t, k) => (k ? value(t - 1e-6) : value(t))),
  };
}
