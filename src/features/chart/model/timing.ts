import { cmp, toFloat } from './beat';
import type { BpmPoint } from './types';

interface Segment {
  beat: number;
  seconds: number;
  bpm: number;
}

const cache = new WeakMap<BpmPoint[], Segment[]>();

function segments(bpmList: BpmPoint[]): Segment[] {
  let segs = cache.get(bpmList);
  if (segs) return segs;
  const sorted = [...bpmList].sort((a, b) => cmp(a.beat, b.beat));
  segs = [];
  let seconds = 0;
  for (let i = 0; i < sorted.length; i++) {
    const beat = toFloat(sorted[i].beat);
    if (i > 0) {
      const prev = segs[i - 1];
      seconds += ((beat - prev.beat) * 60) / prev.bpm;
    }
    segs.push({ beat, seconds, bpm: sorted[i].bpm });
  }
  if (!segs.length) segs.push({ beat: 0, seconds: 0, bpm: 120 });
  cache.set(bpmList, segs);
  return segs;
}

function find(segs: Segment[], key: 'beat' | 'seconds', value: number) {
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid][key] <= value) lo = mid;
    else hi = mid - 1;
  }
  return segs[lo];
}

export function beatToSeconds(bpmList: BpmPoint[], beat: number) {
  const s = find(segments(bpmList), 'beat', beat);
  return s.seconds + ((beat - s.beat) * 60) / s.bpm;
}

export function secondsToBeat(bpmList: BpmPoint[], seconds: number) {
  const s = find(segments(bpmList), 'seconds', seconds);
  return s.beat + ((seconds - s.seconds) * s.bpm) / 60;
}
