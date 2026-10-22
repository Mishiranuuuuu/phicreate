import { createId } from '@/lib/id';
import { add, cmp, toFloat } from '../../model/beat';
import { createLayer, NOISE_READY_FLASH } from '../../model/defaults';
import { ease } from '../../model/easing';
import type { Channel, Easing, NoiseField, NumEvent } from '../../model/types';
import { FIT_EPS, fitEvents, type Segment } from '../fit';
import { beat, easing, num, numEvents } from './fromRpe';
import type { RpeBeat, RpeNoiseArea, RpeNoiseEvent } from './types';

const CHANNELS: [keyof RpeNoiseArea, Channel][] = [
  ['moveXEvents', 'moveX'],
  ['moveYEvents', 'moveY'],
  ['rotateEvents', 'rotate'],
  ['scaleXEvents', 'scaleX'],
  ['scaleYEvents', 'scaleY'],
];

// Pivot compensation sample step, in beats.
const STEP = 1 / 16;
const BEFORE = 1e-7;

type Affine = [number, number, number, number, number, number];
type Kind = 'scaleX' | 'scaleY' | 'rotate';

const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];
const apply = (m: Affine, [x, y]: [number, number]): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

function compose(after: Affine, before: Affine): Affine {
  const [e, f] = apply(after, [before[4], before[5]]);
  return [
    after[0] * before[0] + after[2] * before[1],
    after[1] * before[0] + after[3] * before[1],
    after[0] * before[2] + after[2] * before[3],
    after[1] * before[2] + after[3] * before[3],
    e,
    f,
  ];
}

function relative(kind: Kind, from: number, to: number, [ax, ay]: [number, number]): Affine {
  if (kind === 'rotate') {
    const a = ((to - from) * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return [cos, -sin, sin, cos, ax * (1 - cos) - ay * sin, ay * (1 - cos) + ax * sin];
  }
  const r = from === 0 || !Number.isFinite(to / from) ? 1 : to / from;
  return kind === 'scaleX' ? [r, 0, 0, 1, ax * (1 - r), 0] : [1, 0, 0, r, 0, ay * (1 - r)];
}

interface ChainStep {
  start: number;
  end: number;
  from: number;
  to: number;
  easing: Easing;
  tStart: number;
  tEnd: number;
  anchor: [number, number];
  prefix: Affine;
}

interface Chain {
  kind: Kind;
  steps: ChainStep[];
}

function chain(kind: Kind, src: RpeNoiseEvent[] | undefined, center: [number, number]): Chain {
  const sorted = (src ?? [])
    .map((e) => {
      const start = toFloat(beat(e.startTime));
      const end = Math.max(start, toFloat(beat(e.endTime)));
      const from = num(e.start, 0);
      const to = num(e.end, 0);
      return {
        start,
        end,
        from,
        to,
        easing: easing(e),
        tStart: num(e.transformStart, from),
        tEnd: num(e.transformEnd, to),
        anchor: (e.anchor
          ? [num(e.anchor.x, center[0]), num(e.anchor.y, center[1])]
          : center) as [number, number],
      };
    })
    .sort((a, b) => a.start - b.start);

  let prefix = IDENTITY;
  let prev: (typeof sorted)[number] | null = null;
  const steps: ChainStep[] = sorted.map((s) => {
    if (prev) {
      prefix = compose(relative(kind, prev.tStart, prev.tEnd, prev.anchor), prefix);
      prefix = compose(relative(kind, prev.tEnd, s.tStart, prev.anchor), prefix);
    }
    prev = s;
    return { ...s, prefix };
  });
  return { kind, steps };
}

function chainAt({ kind, steps }: Chain, t: number, p: [number, number]): [number, number] {
  let k = -1;
  while (k + 1 < steps.length && steps[k + 1].start <= t) k++;
  if (k < 0) return p;
  const s = steps[k];
  const val =
    t >= s.end || s.from === s.to
      ? s.to
      : s.from + (s.to - s.from) * ease(s.easing, (t - s.start) / (s.end - s.start));
  return apply(relative(kind, s.tStart, val, s.anchor), apply(s.prefix, p));
}

function pivotLayer(chains: Chain[], center: [number, number]) {
  const hasCustomAnchor = chains.some((c) =>
    c.steps.some((s) => s.anchor[0] !== center[0] || s.anchor[1] !== center[1]),
  );
  if (!hasCustomAnchor) return null;
  const times = new Set<number>();
  for (const { steps } of chains) for (const s of steps) times.add(s.start).add(s.end);
  if (!times.size) return null;
  const sorted = [...times].sort((a, b) => a - b);
  const grid: number[] = [];
  sorted.forEach((t, i) => {
    grid.push(t);
    const next = sorted[i + 1];
    if (next !== undefined) for (let s = t + STEP; s < next; s += STEP) grid.push(s);
  });
  const offset = (t: number) => {
    let p = center;
    for (const c of chains) p = chainAt(c, t, p);
    return [p[0] - center[0], p[1] - center[1]];
  };
  const segs: [Segment[], Segment[]] = [[], []];
  let needed = false;
  for (let i = 0; i < grid.length; i++) {
    const t = grid[i];
    const from = offset(t);
    const end = grid[i + 1] ?? t;
    const to = i + 1 < grid.length ? offset(end - BEFORE) : from;
    for (const axis of [0, 1]) {
      segs[axis].push({ start: t, end, from: from[axis], to: to[axis] });
      needed ||= Math.abs(from[axis]) > FIT_EPS.move;
    }
  }
  if (!needed) return null;
  const layer = createLayer('Layer 1');
  layer.moveX = fitEvents(segs[0], FIT_EPS.move, 0);
  layer.moveY = fitEvents(segs[1], FIT_EPS.move, 0);
  return layer;
}

const range = (start: RpeBeat | undefined, end: RpeBeat | undefined, value = 1): NumEvent => ({
  id: createId(),
  start: beat(start),
  end: beat(end),
  from: value,
  to: value,
  easing: { kind: 'preset', id: 1 },
  locked: true,
});

const flash = (v: number | boolean | undefined) =>
  typeof v === 'boolean' ? (v ? NOISE_READY_FLASH : 0) : Math.max(0, num(v, NOISE_READY_FLASH));

const valid = (events: NumEvent[]) => events.filter((e) => cmp(e.end, e.start) > 0);

// Zero-length events (rpe-next instant steps) jump to their value: short holds, cut at the next event.
const steps = (events: NumEvent[]) =>
  valid(
    events.map((e, i) => {
      if (cmp(e.end, e.start) > 0) return e;
      const next = events[i + 1];
      const end = add(e.start, [0, 1, 4]);
      return { ...e, from: e.to, end: next && cmp(next.start, end) < 0 ? next.start : end };
    }),
  );

export function rpeToNoiseFields(list: RpeNoiseArea[] | undefined): NoiseField[] {
  return (list ?? []).map((a, i) => {
    const bl = { x: num(a.bottomLeft?.x, -250), y: num(a.bottomLeft?.y, -150) };
    const tr = { x: num(a.topRight?.x, 250), y: num(a.topRight?.y, 150) };
    const center: [number, number] = [(bl.x + tr.x) / 2, (bl.y + tr.y) / 2];
    const defaults = { moveX: center[0], moveY: center[1] };
    const layer = createLayer('Base');
    for (const [key, channel] of CHANNELS) {
      layer[channel] = steps(numEvents(a[key] as Parameters<typeof numEvents>[0]));
    }
    const layers = [layer];
    const pivots = pivotLayer(
      [
        chain('scaleX', a.scaleXEvents, center),
        chain('scaleY', a.scaleYEvents, center),
        chain('rotate', a.rotateEvents, center),
      ],
      center,
    );
    if (pivots) layers.push(pivots);
    const appear = beat(a.appearTime);
    const disappear = beat(a.disappearTime);
    return {
      id: createId(),
      name: a.Name || `Noise field ${i}`,
      size: [Math.abs(tr.x - bl.x), Math.abs(tr.y - bl.y)],
      subtract: !!a.isInvert,
      defaults,
      parentId: null,
      rotateWithParent: true,
      layers,
      visible: valid([range(a.appearTime, a.disappearTime)]),
      active: valid(
        (a.activeIntervals ?? []).map((r) => {
          const s = beat(r.startTime);
          const e = beat(r.endTime);
          return range(
            cmp(s, appear) < 0 ? a.appearTime : r.startTime,
            cmp(e, disappear) > 0 ? a.disappearTime : r.endTime,
            flash(r.readyFlash),
          );
        }),
      ).sort((x, y) => cmp(x.start, y.start)),
    };
  });
}
