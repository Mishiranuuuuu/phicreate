import { cmp, fromFloat } from '../../model/beat';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  createChart,
  createLine,
  createNote,
  withDefaults,
} from '../../model/defaults';
import type { Chart, JudgeLine, Note, NoteType } from '../../model/types';
import { FIT_EPS, fitEvents, type Segment } from '../fit';
import { officialToNoiseFields } from './noise';
import {
  toX,
  toY,
  type OfficialChart,
  type OfficialEvent,
  type OfficialLine,
  type OfficialNote,
} from './types';

const NOTE_TYPES: Record<number, NoteType> = { 1: 'tap', 2: 'drag', 3: 'hold', 4: 'flick' };

// Official speed 1 = 0.6 frame heights / s; PhiCreate speed 1 = 120 units / s.
const SPEED_SCALE = (0.6 * CANVAS_HEIGHT) / 120;
// Note x unit: 0.05625 frame widths.
const NOTE_X = 0.05625 * CANVAS_WIDTH;

const num = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

// formatVersion 1 packs x and y into one int: x / 880, y / 520.
const unpack = (v: number) => [Math.floor(v / 1000) / 880, (v % 1000) / 520];

function lineToJudgeLine(src: OfficialLine, i: number, fv: number, bpm0: number): JudgeLine {
  const bpm = num(src.bpm, bpm0) || bpm0;
  // Line time (128th notes at the line's bpm) to chart beats.
  const beat = (t: number) => (num(t) / 32) * (bpm0 / bpm);
  const segs = (
    list: OfficialEvent[] | undefined,
    value: (e: OfficialEvent, end: boolean) => number,
  ) =>
    (list ?? []).map((e): Segment => ({
      start: beat(e.startTime),
      end: beat(e.endTime),
      from: value(e, false),
      to: value(e, true),
    }));

  const moves = src.judgeLineMoveEvents;
  const pos = (e: OfficialEvent, end: boolean, axis: 0 | 1) => {
    const v = num(end ? e.end : e.start);
    if (fv === 1) return unpack(v)[axis];
    return axis === 0 ? v : num(end ? e.end2 : e.start2);
  };

  const line = createLine(`Line ${i}`);
  const base = line.layers[0];
  base.moveX = fitEvents(
    segs(moves, (e, end) => toX(pos(e, end, 0))),
    FIT_EPS.move,
    0,
  );
  base.moveY = fitEvents(
    segs(moves, (e, end) => toY(pos(e, end, 1))),
    FIT_EPS.move,
    0,
  );
  // Official rotation is counterclockwise.
  base.rotate = fitEvents(
    segs(src.judgeLineRotateEvents, (e, end) => -num(end ? e.end : e.start)),
    FIT_EPS.rotate,
    0,
  );
  base.alpha = fitEvents(
    segs(src.judgeLineDisappearEvents, (e, end) => num(end ? e.end : e.start) * 255),
    FIT_EPS.alpha,
    0,
  );
  const speeds = (src.speedEvents ?? []).map((e) => ({
    start: beat(e.startTime),
    end: beat(e.endTime),
    from: num(e.value) * SPEED_SCALE,
    to: num(e.value) * SPEED_SCALE,
  }));
  base.speed = fitEvents(speeds, 0, 10, false);

  const note = (n: OfficialNote, above: boolean): Note => {
    const type = NOTE_TYPES[n.type] ?? 'tap';
    const hold = type === 'hold' && num(n.holdTime) > 0;
    return createNote({
      type: hold ? 'hold' : type === 'hold' ? 'tap' : type,
      beat: fromFloat(beat(n.time), 960),
      endBeat: hold ? fromFloat(beat(num(n.time) + num(n.holdTime)), 960) : undefined,
      x: num(n.positionX) * NOTE_X,
      above,
      // Hold speed is only the tail's; the head moves with the line (speed 1).
      speed: hold ? 1 : num(n.speed, 1),
    });
  };
  line.notes = [
    ...(src.notesAbove ?? []).map((n) => note(n, true)),
    ...(src.notesBelow ?? []).map((n) => note(n, false)),
  ].sort((a, b) => cmp(a.beat, b.beat));
  return line;
}

// Converts an official Phigros chart; sliced linear events are refitted into eased ones.
// Lossy: floorPosition is dropped; line BPMs are folded into the first line's.
export function officialToChart(src: OfficialChart): Chart {
  const bpm0 = num(src.judgeLineList[0]?.bpm, 120) || 120;
  const fv = num(src.formatVersion, 3);
  const chart = createChart(bpm0, 0);
  chart.offsetMs = num(src.offset) * 1000;
  chart.lines = src.judgeLineList.map((l, i) => lineToJudgeLine(l ?? { bpm: bpm0 }, i, fv, bpm0));
  chart.noiseFields = officialToNoiseFields(src.blockAreaList, bpm0, num(src.offset));
  return withDefaults(chart);
}
