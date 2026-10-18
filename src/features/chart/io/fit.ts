import { createId } from '@/lib/id';
import { cmp, fromFloat } from '../model/beat';
import { ease } from '../model/easing';
import type { Easing, NumEvent } from '../model/types';

// Linear piece in float beats.
export interface Segment {
  start: number;
  end: number;
  from: number;
  to: number;
}

// Max fitting error per channel, in PhiCreate units.
export const FIT_EPS = { move: 0.5, rotate: 0.05, alpha: 0.5, scale: 0.002 };

const DENSITY = 960;
// Constant (jump) events are shortened to this many beats.
const SHRINK = 0.25;
const TINY = 1e-6;

// Monotonic RPE presets, simplest first.
const CANDIDATES: Easing[] = [
  1, 2, 3, 6, 4, 5, 7, 8, 9, 12, 10, 11, 13, 14, 15, 16, 17, 18, 19, 22,
].map((id) => ({ kind: 'preset', id }));

const same = (a: number, b: number) => Math.abs(a - b) <= TINY * Math.max(1, Math.abs(a));
const isConstant = (s: Segment) => same(s.from, s.to);

const event = (start: number, end: number, from: number, to: number, easing: Easing): NumEvent => ({
  id: createId(),
  start: fromFloat(start, DENSITY),
  end: fromFloat(end, DENSITY),
  from,
  to,
  easing,
});

// Sorts, trims overlaps and turns zero-length segments into constants.
function clean(segs: Segment[]): Segment[] {
  const sorted = segs
    .filter((s) => [s.start, s.end, s.from, s.to].every(Number.isFinite))
    .map((s) =>
      s.end > s.start ? { ...s } : { start: s.start, end: s.start, from: s.to, to: s.to },
    )
    .sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  for (const s of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.end > s.start) {
      const p = prev.end > prev.start ? (s.start - prev.start) / (prev.end - prev.start) : 1;
      prev.to = prev.from + (prev.to - prev.from) * p;
      prev.end = s.start;
      if (prev.end <= prev.start && !isConstant(prev)) out.pop();
    }
    out.push(s);
  }
  return out;
}

type Piece = { constant: true; seg: Segment } | { constant: false; run: Segment[] };

// Groups into merged constants and contiguous monotonic runs.
function pieces(segs: Segment[], eps: number, fit: boolean): Piece[] {
  const out: Piece[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (isConstant(s)) {
      if (last?.constant && same(last.seg.to, s.from) && Math.abs(last.seg.end - s.start) < TINY) {
        last.seg.end = Math.max(last.seg.end, s.end);
      } else out.push({ constant: true, seg: { ...s } });
      continue;
    }
    const prev = last && !last.constant ? last.run[last.run.length - 1] : null;
    const joins =
      fit &&
      prev &&
      Math.abs(prev.end - s.start) < TINY &&
      Math.abs(prev.to - s.from) <= eps &&
      Math.sign(prev.to - prev.from) === Math.sign(s.to - s.from);
    if (joins) (last as { run: Segment[] }).run.push(s);
    else out.push({ constant: false, run: [s] });
  }
  return out;
}

// Best easing from run[i].start to run[j].end that passes every breakpoint within eps.
function fitRange(run: Segment[], i: number, j: number, eps: number) {
  const t0 = run[i].start;
  const v0 = run[i].from;
  const t1 = run[j].end;
  const v1 = run[j].to;
  let best: { easing: Easing; err: number } | null = null;
  for (const easing of CANDIDATES) {
    let err = 0;
    for (let k = i; k <= j && err <= eps; k++) {
      const at = (t: number) => v0 + (v1 - v0) * ease(easing, (t - t0) / (t1 - t0));
      err = Math.max(
        err,
        Math.abs(at(run[k].start) - run[k].from),
        Math.abs(at(run[k].end) - run[k].to),
      );
    }
    if (err <= eps && (!best || err < best.err)) best = { easing, err };
  }
  return best;
}

// Greedy: gallop then binary search the longest fitting span from each start.
function fitRun(run: Segment[], eps: number): NumEvent[] {
  const out: NumEvent[] = [];
  let i = 0;
  while (i < run.length) {
    let ok = 1;
    let fail = run.length - i + 1;
    for (let len = 2; len < fail; len *= 2) {
      if (fitRange(run, i, i + len - 1, eps)) ok = len;
      else fail = len;
    }
    while (fail - ok > 1) {
      const mid = (ok + fail) >> 1;
      if (fitRange(run, i, i + mid - 1, eps)) ok = mid;
      else fail = mid;
    }
    const j = i + ok - 1;
    const easing = fitRange(run, i, j, eps)?.easing ?? CANDIDATES[0];
    out.push(event(run[i].start, run[j].end, run[i].from, run[j].to, easing));
    i = j + 1;
  }
  return out;
}

// Rebuilds eased events from linear slices. `held` = value before the first event.
// Without `fit`, non-constant segments stay linear (still merging constants).
export function fitEvents(segs: Segment[], eps: number, held: number, fit = true): NumEvent[] {
  const list = pieces(clean(segs), eps, fit);
  const out: NumEvent[] = [];
  list.forEach((p, k) => {
    if (!p.constant) {
      const events = fitRun(p.run, eps);
      out.push(...events);
      held = p.run[p.run.length - 1].to;
      return;
    }
    const { start, end, to } = p.seg;
    if (same(to, held)) return;
    const next = list[k + 1];
    const nextStart = next ? (next.constant ? next.seg.start : next.run[0].start) : Infinity;
    const len = Math.min(SHRINK, nextStart - start, end > start ? end - start : SHRINK);
    // Overridden right away by the next piece.
    if (len < 1 / DENSITY) return;
    out.push(event(start, start + len, to, to, { kind: 'preset', id: 1 }));
    held = to;
  });
  return out.filter((e) => cmp(e.end, e.start) > 0);
}
