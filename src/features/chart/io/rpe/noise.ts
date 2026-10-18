import { createId } from '@/lib/id';
import { add, cmp } from '../../model/beat';
import { createLayer, NOISE_READY_FLASH } from '../../model/defaults';
import type { Channel, NoiseField, NumEvent } from '../../model/types';
import { beat, num, numEvents } from './fromRpe';
import type { RpeBeat, RpeNoiseArea } from './types';

const CHANNELS: [keyof RpeNoiseArea, Channel][] = [
  ['moveXEvents', 'moveX'],
  ['moveYEvents', 'moveY'],
  ['rotateEvents', 'rotate'],
  ['scaleXEvents', 'scaleX'],
  ['scaleYEvents', 'scaleY'],
];

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

// Lossy: per-event anchors, link groups and hooks are dropped.
export function rpeToNoiseFields(list: RpeNoiseArea[] | undefined): NoiseField[] {
  return (list ?? []).map((a, i) => {
    const bl = { x: num(a.bottomLeft?.x, -250), y: num(a.bottomLeft?.y, -150) };
    const tr = { x: num(a.topRight?.x, 250), y: num(a.topRight?.y, 150) };
    const layer = createLayer('Base');
    for (const [key, channel] of CHANNELS) {
      layer[channel] = steps(numEvents(a[key] as Parameters<typeof numEvents>[0]));
    }
    return {
      id: createId(),
      name: a.Name || `Noise field ${i}`,
      size: [Math.abs(tr.x - bl.x), Math.abs(tr.y - bl.y)],
      subtract: !!a.isInvert,
      defaults: { moveX: (bl.x + tr.x) / 2, moveY: (bl.y + tr.y) / 2 },
      parentId: null,
      rotateWithParent: true,
      layers: [layer],
      visible: valid([range(a.appearTime, a.disappearTime)]),
      active: valid(
        (a.activeIntervals ?? []).map((r) => range(r.startTime, r.endTime, flash(r.readyFlash))),
      ).sort((x, y) => cmp(x.start, y.start)),
    };
  });
}
