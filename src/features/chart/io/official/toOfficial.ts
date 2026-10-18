import { cmp, toFloat } from '../../model/beat';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../model/defaults';
import { beatToSeconds } from '../../model/timing';
import {
  CHANNELS,
  type Beat,
  type Chart,
  type JudgeLine,
  type NoiseField,
  type Note,
  type NoteType,
} from '../../model/types';
import { attach, createSampler, lineRuntime, noiseRuntime, toWorld } from '../../runtime/scene';

type Sampler = ReturnType<typeof createSampler>;
import { align, simplify } from '../bake';
import { FIT_EPS, type Segment } from '../fit';
import {
  fromX,
  fromY,
  type OfficialBlockArea,
  type OfficialChart,
  type OfficialEvent,
  type OfficialLine,
  type OfficialNote,
  type OfficialPoint,
  type OfficialSpeedEvent,
} from './types';

export type FakeNotes = 'delete' | 'real';

const NOTE_TYPES: Record<NoteType, number> = { tap: 1, drag: 2, hold: 3, flick: 4 };

// Official speed 1 = 1 height unit (0.6 frame heights) per second.
const HEIGHT_UNIT = 0.6 * CANVAS_HEIGHT;
const NOTE_X = 0.05625 * CANVAS_WIDTH;
// Players stretch the 3:2 canvas to 16:9 and rotate children on screen (Phira, Phigros).
const Y_SCALE = CANVAS_WIDTH / CANVAS_HEIGHT / (16 / 9);
const BEFORE = 1e-6;
// Samples land just after the tick, so events starting on it count despite float error.
const AFTER = 1e-9;
const FIRST = -999999;
const FOREVER = 1e9;
// Ticks sampled past the last event or note.
const TAIL = 32;
const SPEED_EPS = 1e-6;

type Values = { at: number[]; before: number[] };
const values = (): Values => ({ at: [], before: [] });

// Negative alpha hides notes: never fitted together with visible alpha.
const hidden = (v: number) => v < 0;

// Fitting (or float error) can dip alpha below 0, which hides the line's notes (Phira).
// Keeps only negatives the chart really has; `v` is sampled per tick.
const unclip = (s: Segment, v: Values): Segment => ({
  ...s,
  from: v.at[s.start] < 0 ? s.from : Math.max(0, s.from),
  to: v.before[s.end] < 0 ? s.to : Math.max(0, s.to),
});

// Keyframes on aligned tracks; a jump adds a second frame at the same time.
function frames(tracks: Segment[][], eps: number[]) {
  const out: { time: number; values: number[] }[] = [];
  tracks[0]?.forEach((_, k) => {
    const prev = out[out.length - 1];
    const from = tracks.map((t) => t[k].from);
    if (!prev || from.some((v, i) => Math.abs(v - prev.values[i]) > eps[i])) {
      out.push({ time: tracks[0][k].start, values: from });
    }
    out.push({ time: tracks[0][k].end, values: tracks.map((t) => t[k].to) });
  });
  return out;
}

// Line events held before tick 0 and after the last piece.
function framed<T extends { startTime: number; endTime: number }>(
  list: T[],
  hold: (e: T, end: boolean) => T,
): T[] {
  if (!list.length) return list;
  const first = hold(list[0], false);
  const last = hold(list[list.length - 1], true);
  return [
    { ...first, startTime: FIRST, endTime: list[0].startTime },
    ...list,
    { ...last, startTime: list[list.length - 1].endTime, endTime: FOREVER },
  ];
}

interface Grid {
  bpm: number;
  tickSec: number;
  toTick: (b: Beat) => number;
}

function lastTick(chart: Chart, grid: Grid) {
  let end = 0;
  for (const line of chart.lines) {
    for (const layer of line.layers)
      for (const c of CHANNELS) for (const e of layer[c]) end = Math.max(end, grid.toTick(e.end));
    for (const n of line.notes) end = Math.max(end, grid.toTick(n.endBeat ?? n.beat));
  }
  return Math.ceil(end) + TAIL;
}

function speedEvents(line: JudgeLine, chart: Chart, grid: Grid, ticks: number) {
  const runtime = lineRuntime(line, chart.bpmList);
  const floors = Array.from({ length: ticks + 1 }, (_, k) => runtime.floor(k * grid.tickSec));
  const speed = (a: number, b: number) =>
    (floors[b] - floors[a]) / ((b - a) * grid.tickSec) / HEIGHT_UNIT;
  const out: OfficialSpeedEvent[] = [];
  let floor = 0;
  for (let k = 0; k < ticks; k++) {
    const v = speed(k, k + 1);
    const last = out[out.length - 1];
    if (last && Math.abs(last.value - v) <= SPEED_EPS * Math.max(1, Math.abs(v))) {
      last.endTime = k + 1;
      last.value = speed(last.startTime, k + 1);
      continue;
    }
    if (last) floor += last.value * (last.endTime - last.startTime) * grid.tickSec;
    out.push({ startTime: k, endTime: k + 1, value: v, floorPosition: floor });
  }
  if (out.length) out[out.length - 1].endTime = FOREVER;
  return out;
}

function lineNotes(notes: Note[], speeds: OfficialSpeedEvent[], grid: Grid, fakeNotes: FakeNotes) {
  const eventAt = (t: number) => {
    let found = speeds[0];
    for (const e of speeds) if (e.startTime <= t) found = e;
    return found;
  };
  const floorAt = (t: number) => {
    const e = eventAt(t);
    return e ? (e.floorPosition ?? 0) + e.value * (t - e.startTime) * grid.tickSec : 0;
  };
  const above: OfficialNote[] = [];
  const below: OfficialNote[] = [];
  for (const n of [...notes].sort((a, b) => cmp(a.beat, b.beat))) {
    if (n.fake && fakeNotes === 'delete') continue;
    const time = Math.round(grid.toTick(n.beat));
    const hold = n.type === 'hold' && n.endBeat;
    const holdTime = hold ? Math.max(0, Math.round(grid.toTick(n.endBeat!)) - time) : 0;
    // Hold speed is the tail's: the line's mean speed over the hold.
    const tail = holdTime
      ? (floorAt(time + holdTime) - floorAt(time)) / (holdTime * grid.tickSec)
      : (eventAt(time)?.value ?? 1);
    const note: OfficialNote = {
      type: NOTE_TYPES[n.type],
      time,
      holdTime,
      positionX: n.x / NOTE_X,
      speed: hold ? n.speed * tail : n.speed,
      floorPosition: floorAt(time),
    };
    (n.above ? above : below).push(note);
  }
  return { above, below };
}

// An exported line: a judge line, or an invisible carrier for its notes `offset` (y offset)
// along its normal, as official notes have no y offset.
interface Exported {
  index: number;
  offset: number;
  notes: Note[];
}

function exportedLines(chart: Chart): Exported[] {
  const lines: Exported[] = [];
  const carriers: Exported[] = [];
  chart.lines.forEach((line, index) => {
    const groups = new Map<number, Note[]>([[0, []]]);
    for (const n of line.notes) {
      const offset = Number((n.yOffset * n.speed * (n.above ? 1 : -1)).toFixed(6));
      if (!groups.has(offset)) groups.set(offset, []);
      groups.get(offset)!.push(n);
    }
    for (const [offset, notes] of groups)
      (offset ? carriers : lines).push({ index, offset, notes });
  });
  return [...lines, ...carriers];
}

function convertLines(chart: Chart, grid: Grid, fakeNotes: FakeNotes): OfficialLine[] {
  const ticks = lastTick(chart, grid);
  const times = Array.from({ length: ticks + 1 }, (_, k) => k);
  const exported = exportedLines(chart);
  const tracks = exported.map(() => ({
    x: values(),
    y: values(),
    rotate: values(),
    alpha: values(),
  }));
  // Carriers follow their line; alpha stays hidden (negative still hides the notes).
  const state = (sample: Sampler, e: Exported) => {
    const s = sample(e.index);
    if (!e.offset) return s;
    const local = { ...s, x: 0, y: e.offset, rotation: 0, alpha: Math.min(s.alpha, 0) };
    return toWorld(local, s, true, Y_SCALE);
  };
  for (const k of times) {
    const t = k * grid.tickSec;
    const now = createSampler(chart, t + AFTER, Y_SCALE);
    const before = createSampler(chart, k ? t - BEFORE : t, Y_SCALE);
    tracks.forEach((track, i) => {
      const a = state(now, exported[i]);
      const b = state(before, exported[i]);
      track.x.at.push(a.x);
      track.x.before.push(b.x);
      track.y.at.push(a.y);
      track.y.before.push(b.y);
      track.rotate.at.push(a.rotation);
      track.rotate.before.push(b.rotation);
      track.alpha.at.push(a.alpha);
      track.alpha.before.push(b.alpha);
    });
  }

  const speedCache = new Map<number, OfficialSpeedEvent[]>();
  return exported.map((e, i) => {
    const track = tracks[i];
    const fit = (v: Values, eps: number) => simplify({ times, ...v }, eps);
    const [mx, my] = align([fit(track.x, FIT_EPS.move), fit(track.y, FIT_EPS.move)]);
    const event = (s: Segment, value: (v: number) => number): OfficialEvent => ({
      startTime: s.start,
      endTime: s.end,
      start: value(s.from),
      end: value(s.to),
    });
    const hold = (e: OfficialEvent, end: boolean): OfficialEvent => {
      const v = end ? e.end : e.start;
      const v2 = end ? e.end2 : e.start2;
      return { ...e, start: v, end: v, ...(v2 !== undefined && { start2: v2, end2: v2 }) };
    };
    let speeds = speedCache.get(e.index);
    if (!speeds) {
      speeds = speedEvents(chart.lines[e.index], chart, grid, ticks);
      speedCache.set(e.index, speeds);
    }
    const { above, below } = lineNotes(e.notes, speeds, grid, fakeNotes);
    return {
      bpm: grid.bpm,
      notesAbove: above,
      notesBelow: below,
      numOfNotes: above.length + below.length,
      numOfNotesAbove: above.length,
      numOfNotesBelow: below.length,
      speedEvents: speeds,
      judgeLineMoveEvents: framed(
        mx.map((s, k) => ({
          ...event(s, fromX),
          start2: fromY(my[k].from),
          end2: fromY(my[k].to),
        })),
        hold,
      ),
      // Official rotation is counterclockwise.
      judgeLineRotateEvents: framed(
        fit(track.rotate, FIT_EPS.rotate).map((s) => event(s, (v) => -v)),
        hold,
      ),
      judgeLineDisappearEvents: framed(
        simplify({ times, ...track.alpha }, FIT_EPS.alpha, hidden).map((s) =>
          event(unclip(s, track.alpha), (v) => v / 255),
        ),
        hold,
      ),
    };
  });
}

const point = (x: number, y: number): OfficialPoint => ({ x: fromX(x), y: fromY(y) });

// One area per visible range, split at active range ends (official areas enable once).
function blockAreas(
  field: NoiseField,
  chart: Chart,
  grid: Grid,
  offset: number,
): OfficialBlockArea[] {
  const runtime = noiseRuntime(field, chart.bpmList);
  const range = (e: { start: Beat; end: Beat }) => [grid.toTick(e.start), grid.toTick(e.end)];
  const visible = field.visible.map(range).sort((a, b) => a[0] - b[0]);
  const active = field.active.map(range).sort((a, b) => a[0] - b[0]);
  const sec = (tick: number) => tick * grid.tickSec + offset;

  return visible.flatMap(([from, to]) => {
    const inside = active
      .filter(([a, b]) => b > from && a < to)
      .map(([a, b]) => [Math.max(a, from), Math.min(b, to)]);
    const pieces = inside.length
      ? inside.map(([a, b], k) => ({
          from: k ? inside[k - 1][1] : from,
          to: k === inside.length - 1 ? to : b,
          enable: [a, b],
        }))
      : [{ from, to, enable: null }];

    return pieces.flatMap((piece): OfficialBlockArea[] => {
      if (piece.to <= piece.from) return [];
      const times: number[] = [];
      for (let t = piece.from; t < piece.to; t++) times.push(t);
      times.push(piece.to);
      const channels = {
        x: values(),
        y: values(),
        rotate: values(),
        scaleX: values(),
        scaleY: values(),
      };
      times.forEach((tick, k) => {
        const t = tick * grid.tickSec;
        for (const [key, time] of [
          ['at', t + AFTER],
          ['before', k ? t - BEFORE : t],
        ] as const) {
          const s = attach(
            chart,
            createSampler(chart, time, Y_SCALE),
            field,
            runtime.localState(time),
            Y_SCALE,
          );
          channels.x[key].push(s.x);
          channels.y[key].push(s.y);
          channels.rotate[key].push(s.rotation);
          channels.scaleX[key].push(s.scaleX);
          channels.scaleY[key].push(s.scaleY);
        }
      });
      const fit = (v: Values, eps: number) => simplify({ times, ...v }, eps);
      const [cx, cy] = [channels.x.at[0], channels.y.at[0]];
      const anchor = point(cx, cy);
      const [w, h] = field.size;
      const move = frames(align([fit(channels.x, FIT_EPS.move), fit(channels.y, FIT_EPS.move)]), [
        FIT_EPS.move,
        FIT_EPS.move,
      ]);
      const rotate = frames([fit(channels.rotate, FIT_EPS.rotate)], [FIT_EPS.rotate]);
      const scale = frames(
        align([fit(channels.scaleX, FIT_EPS.scale), fit(channels.scaleY, FIT_EPS.scale)]),
        [FIT_EPS.scale, FIT_EPS.scale],
      );
      const [enable, disable] = piece.enable ?? [piece.to, piece.to];
      return [
        {
          bottomLeftPercentage: point(cx - w / 2, cy - h / 2),
          topRightPercentage: point(cx + w / 2, cy + h / 2),
          appearTime: sec(piece.from),
          enableTime: sec(enable),
          disableTime: sec(disable),
          disappearTime: sec(piece.to),
          isSubtract: field.subtract,
          moveEvents: move.map((f) => ({
            time: sec(f.time),
            endPosition: point(f.values[0], f.values[1]),
            easeTypeX: 0,
            easeTypeY: 0,
          })),
          // Official rotation is counterclockwise.
          rotateEvents: rotate.map((f) => ({
            time: sec(f.time),
            rotation: -f.values[0],
            anchor,
            easeType: 0,
          })),
          scaleEvents: scale.map((f) => ({
            time: sec(f.time),
            scale: { x: f.values[0], y: f.values[1] },
            anchor,
            easeTypeX: 0,
            easeTypeY: 0,
          })),
        },
      ];
    });
  });
}

// Bakes every line into linear events on the first BPM (formatVersion 3).
// Lossy: easings, parents and layers are flattened; scale, color, texts, media, effects
// and note alpha / size / y offset / visible time / tint are dropped.
export function chartToOfficial(chart: Chart, fakeNotes: FakeNotes): OfficialChart {
  const first = [...chart.bpmList].sort((a, b) => cmp(a.beat, b.beat))[0];
  const bpm = first?.bpm ?? 120;
  const tickSec = 1.875 / bpm;
  const grid: Grid = {
    bpm,
    tickSec,
    toTick: (b) => beatToSeconds(chart.bpmList, toFloat(b)) / tickSec,
  };
  const offset = chart.offsetMs / 1000;
  const areas = chart.noiseFields.flatMap((f) => blockAreas(f, chart, grid, offset));
  return {
    formatVersion: 3,
    offset,
    judgeLineList: convertLines(chart, grid, fakeNotes),
    ...(areas.length > 0 && { blockAreaList: areas }),
  };
}
