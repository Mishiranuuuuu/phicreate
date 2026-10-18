import { add, cmp, eq, ZERO } from '../model/beat';
import {
  createEffect,
  createLayer,
  createLine,
  createMedia,
  createNoiseField,
  createText,
} from '../model/defaults';
import {
  CHANNELS,
  type Beat,
  type BpmPoint,
  type Chart,
  type ColorEvent,
  type Event,
  type EventItem,
  type EventOwner,
  type Id,
  type JudgeLine,
  type LayerOwner,
  type MediaObject,
  type NoiseField,
  type Note,
  type NumEvent,
  type ShaderEffect,
  type TextEvent,
  type TextObject,
  type TrackKey,
  isMedia,
  isNoise,
  isPlayable,
  isShader,
  isText,
  isVarKey,
} from '../model/types';

// Pure chart transforms; the store wraps them with undo/redo.

const sortNotes = (notes: Note[]) => notes.sort((a, b) => cmp(a.beat, b.beat) || a.x - b.x);

export const mapLine = (chart: Chart, lineId: Id, fn: (l: JudgeLine) => JudgeLine): Chart => ({
  ...chart,
  lines: chart.lines.map((l) => (l.id === lineId ? fn(l) : l)),
});

export const mapText = (chart: Chart, textId: Id, fn: (t: TextObject) => TextObject): Chart => ({
  ...chart,
  texts: chart.texts.map((t) => (t.id === textId ? fn(t) : t)),
});

export const mapMedia = (
  chart: Chart,
  mediaId: Id,
  fn: (m: MediaObject) => MediaObject,
): Chart => ({
  ...chart,
  media: chart.media.map((m) => (m.id === mediaId ? fn(m) : m)),
});

export const mapEffect = (
  chart: Chart,
  effectId: Id,
  fn: (e: ShaderEffect) => ShaderEffect,
): Chart => ({
  ...chart,
  effects: chart.effects.map((e) => (e.id === effectId ? fn(e) : e)),
});

export const mapNoise = (
  chart: Chart,
  fieldId: Id,
  fn: (f: NoiseField) => NoiseField,
): Chart => ({
  ...chart,
  noiseFields: chart.noiseFields.map((f) => (f.id === fieldId ? fn(f) : f)),
});

const mapOwner = (chart: Chart, id: Id, fn: <T extends EventOwner>(o: T) => T): Chart =>
  chart.texts.some((t) => t.id === id)
    ? mapText(chart, id, fn)
    : chart.media.some((m) => m.id === id)
      ? mapMedia(chart, id, fn)
      : chart.effects.some((e) => e.id === id)
        ? mapEffect(chart, id, fn)
        : chart.noiseFields.some((f) => f.id === id)
          ? mapNoise(chart, id, fn)
          : mapLine(chart, id, fn);

// Skips shader effects (no layers).
const mapLayered = (chart: Chart, id: Id, fn: <T extends LayerOwner>(o: T) => T): Chart =>
  mapOwner(chart, id, (o) => (isShader(o) ? o : (fn(o as LayerOwner) as typeof o)));

export type OwnerPatch = Partial<
  Pick<
    JudgeLine,
    'name' | 'parentId' | 'rotateWithParent' | 'zOrder' | 'anchor' | 'isCover' | 'groupId'
  > &
    Pick<TextObject, 'size'> &
    Pick<MediaObject, 'loop' | 'fit' | 'playingOnly'>
>;

export const patchOwner = (chart: Chart, id: Id, patch: OwnerPatch) =>
  mapLayered(chart, id, (o) => ({ ...o, ...patch }));

// The line and everything parented below it.
export function lineDescendants(lines: JudgeLine[], id: Id) {
  const out = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const l of lines) {
      if (l.parentId && out.has(l.parentId) && !out.has(l.id)) {
        out.add(l.id);
        grew = true;
      }
    }
  }
  return out;
}

export const addNotes = (chart: Chart, lineId: Id, notes: Note[]) =>
  mapLine(chart, lineId, (l) => ({ ...l, notes: sortNotes([...l.notes, ...notes]) }));

export const removeNotes = (chart: Chart, lineId: Id, ids: Id[]) => {
  const set = new Set(ids);
  return mapLine(chart, lineId, (l) => ({ ...l, notes: l.notes.filter((n) => !set.has(n.id)) }));
};

export const updateNotes = (chart: Chart, lineId: Id, ids: Id[], fn: (n: Note) => Note) => {
  const set = new Set(ids);
  return mapLine(chart, lineId, (l) => ({
    ...l,
    notes: sortNotes(l.notes.map((n) => (set.has(n.id) ? normalizeNote(fn(n)) : n))),
  }));
};

export const moveNotes = (chart: Chart, lineId: Id, ids: Id[], dBeat: Beat, dx: number) =>
  updateNotes(chart, lineId, ids, (n) => ({
    ...n,
    beat: add(n.beat, dBeat),
    endBeat: n.endBeat && add(n.endBeat, dBeat),
    x: n.x + dx,
  }));

// Keeps hold/non-hold fields consistent.
function normalizeNote(n: Note): Note {
  if (n.type !== 'hold') {
    if (!n.endBeat) return n;
    const rest = { ...n };
    delete rest.endBeat;
    return rest;
  }
  const endBeat = n.endBeat && cmp(n.endBeat, n.beat) > 0 ? n.endBeat : add(n.beat, [1, 0, 1]);
  return { ...n, endBeat };
}

export const hasNoteAt = (line: JudgeLine, type: Note['type'], beat: Beat, x: number) =>
  line.notes.some((n) => n.type === type && n.x === x && eq(n.beat, beat));

export const addLine = (chart: Chart, line = createLine(`Line ${chart.lines.length}`)) => ({
  ...chart,
  lines: [...chart.lines, line],
});

export const removeLine = (chart: Chart, lineId: Id): Chart => ({
  ...chart,
  lines: chart.lines
    .filter((l) => l.id !== lineId)
    .map((l) => (l.parentId === lineId ? { ...l, parentId: null } : l)),
  texts: chart.texts.map((t) => (t.parentId === lineId ? { ...t, parentId: null } : t)),
  media: chart.media.map((m) => (m.parentId === lineId ? { ...m, parentId: null } : m)),
  noiseFields: chart.noiseFields.map((f) =>
    f.parentId === lineId ? { ...f, parentId: null } : f,
  ),
});

export const setLineParent = (chart: Chart, lineId: Id, parentId: Id | null) =>
  mapLine(chart, lineId, (l) => ({ ...l, parentId }));

export const setLineAnchor = (chart: Chart, lineId: Id, anchor: [number, number]) =>
  mapLine(chart, lineId, (l) => ({ ...l, anchor }));

export const renameLine = (chart: Chart, lineId: Id, name: string) =>
  mapLine(chart, lineId, (l) => ({ ...l, name }));

export const addLayer = (chart: Chart, ownerId: Id) =>
  mapLayered(chart, ownerId, (o) => ({
    ...o,
    layers: [...o.layers, createLayer(`Layer ${o.layers.length}`)],
  }));

export const removeLayer = (chart: Chart, ownerId: Id, layerId: Id) =>
  mapLayered(chart, ownerId, (o) =>
    o.layers.length > 1 ? { ...o, layers: o.layers.filter((y) => y.id !== layerId) } : o,
  );

export const addText = (chart: Chart, text = createText(`Text ${chart.texts.length}`)) => ({
  ...chart,
  texts: [...chart.texts, text],
});

// UI texts stay.
export const removeText = (chart: Chart, textId: Id): Chart => ({
  ...chart,
  texts: chart.texts.filter((t) => t.id !== textId || t.builtin),
});

export const addMedia = (chart: Chart, media = createMedia(`Media ${chart.media.length}`)) => ({
  ...chart,
  media: [...chart.media, media],
});

// Swaps the media file; starts are dropped for still images.
export const setMediaFile = (
  chart: Chart,
  mediaId: Id,
  file: Pick<MediaObject, 'kind' | 'assetId'> & Partial<Pick<MediaObject, 'name'>>,
) =>
  mapMedia(chart, mediaId, (m) => ({
    ...m,
    ...file,
    starts: isPlayable(file.kind) ? m.starts : [],
  }));

export const removeMedia = (chart: Chart, mediaId: Id): Chart => ({
  ...chart,
  media: chart.media.filter((m) => m.id !== mediaId),
});

export const addNoiseField = (
  chart: Chart,
  field = createNoiseField(`Noise field ${chart.noiseFields.length}`),
) => ({
  ...chart,
  noiseFields: [...chart.noiseFields, field],
});

export type NoisePatch = Partial<Pick<NoiseField, 'size' | 'subtract' | 'defaults'>>;

export const patchNoiseField = (chart: Chart, fieldId: Id, patch: NoisePatch) =>
  mapNoise(chart, fieldId, (f) => ({ ...f, ...patch }));

export const removeNoiseField = (chart: Chart, fieldId: Id): Chart => ({
  ...chart,
  noiseFields: chart.noiseFields.filter((f) => f.id !== fieldId),
});

export const addEffect = (
  chart: Chart,
  effect = createEffect(`Shader ${chart.effects.length}`),
) => ({
  ...chart,
  effects: [...chart.effects, effect],
});

export const removeEffect = (chart: Chart, effectId: Id): Chart => ({
  ...chart,
  effects: chart.effects.filter((e) => e.id !== effectId),
});

export type EffectPatch = Partial<Pick<ShaderEffect, 'name' | 'shader' | 'global' | 'order'>>;

export const patchEffect = (chart: Chart, effectId: Id, patch: EffectPatch) =>
  mapEffect(chart, effectId, (e) => ({ ...e, ...patch }));

// Repoints effects after a shader file is renamed.
export const renameEffectShader = (chart: Chart, from: string, to: string): Chart => ({
  ...chart,
  effects: chart.effects.map((e) => (e.shader === from ? { ...e, shader: to } : e)),
});

// Single-BPM editing for now: sets the BPM at beat 0.
export const setBaseBpm = (chart: Chart, bpm: number): Chart => ({
  ...chart,
  bpmList: chart.bpmList.length
    ? chart.bpmList.map((p) => (eq(p.beat, ZERO) ? { ...p, bpm } : p))
    : [{ beat: ZERO, bpm }],
});

const sortedBpm = (list: BpmPoint[]) => [...list].sort((a, b) => cmp(a.beat, b.beat));

// Adds a BPM change, or replaces the one already at that beat.
export const setBpmPoint = (chart: Chart, beat: Beat, bpm: number): Chart => ({
  ...chart,
  bpmList: sortedBpm([...chart.bpmList.filter((p) => !eq(p.beat, beat)), { beat, bpm }]),
});

// The point at beat 0 can't move.
export const moveBpmPoint = (chart: Chart, from: Beat, to: Beat): Chart => {
  if (eq(from, ZERO) || cmp(to, ZERO) < 0) return chart;
  if (!eq(from, to) && chart.bpmList.some((p) => eq(p.beat, to))) return chart;
  return {
    ...chart,
    bpmList: sortedBpm(chart.bpmList.map((p) => (eq(p.beat, from) ? { ...p, beat: to } : p))),
  };
};

export const removeBpmPoint = (chart: Chart, beat: Beat): Chart =>
  eq(beat, ZERO) ? chart : { ...chart, bpmList: chart.bpmList.filter((p) => !eq(p.beat, beat)) };

export const bpmAt = (chart: Chart, beat: Beat) =>
  sortedBpm(chart.bpmList)
    .filter((p) => cmp(p.beat, beat) <= 0)
    .at(-1)?.bpm ?? baseBpm(chart);

export const setOffset = (chart: Chart, offsetMs: number): Chart => ({ ...chart, offsetMs });

export const baseBpm = (chart: Chart) =>
  chart.bpmList.find((p) => eq(p.beat, ZERO))?.bpm ?? chart.bpmList[0]?.bpm ?? 120;

// Events (see chart-data-plan §4: no overlaps within one layer channel).

export const findOwner = (chart: Chart, id: Id | null): EventOwner | undefined =>
  chart.lines.find((l) => l.id === id) ??
  chart.texts.find((t) => t.id === id) ??
  chart.media.find((m) => m.id === id) ??
  chart.effects.find((e) => e.id === id) ??
  chart.noiseFields.find((f) => f.id === id);

export function channelValid(events: Event<unknown>[]) {
  return events.every(
    (e, i) =>
      cmp(e.end, e.start) > 0 &&
      cmp(e.start, ZERO) >= 0 &&
      (i === 0 || cmp(events[i - 1].end, e.start) <= 0),
  );
}

const sortEvents = (events: Event<unknown>[]) => events.sort((a, b) => cmp(a.start, b.start));

type AnyEvent = Event<unknown>;
// Returns the same array when the track is unchanged.
type TrackEdit = (events: AnyEvent[], key: TrackKey) => AnyEvent[];

// Applies `fn` to every track (layer channels, color, a text's values, a media's starts,
// a shader's vars, a noise field's visible / active ranges). `layerId` is ignored for shaders. Rejects (returns the same chart) on overlap.
function editEvents(
  chart: Chart,
  ownerId: Id,
  layerId: Id | null,
  fn: TrackEdit,
  newVars: string[] = [],
): Chart {
  const owner = findOwner(chart, ownerId);
  if (!owner) return chart;
  let changed = false;
  let invalid = false;
  const edit = <T extends AnyEvent>(events: T[], key: TrackKey): T[] => {
    const next = fn(events, key) as T[];
    if (next === events) return events;
    sortEvents(next);
    if (!channelValid(next)) invalid = true;
    changed = true;
    return next;
  };

  if (isShader(owner)) {
    const active = edit(owner.active, 'active');
    const vars: Record<string, NumEvent[]> = {};
    for (const key of new Set([...Object.keys(owner.vars), ...newVars])) {
      vars[key] = edit(owner.vars[key] ?? [], `var:${key}`);
    }
    if (!changed || invalid) return chart;
    return mapEffect(chart, ownerId, (e) => ({ ...e, active, vars }));
  }

  const layer = owner.layers.find((y) => y.id === layerId);
  if (!layer) return chart;
  const nextLayer = { ...layer };
  for (const c of CHANNELS) nextLayer[c] = edit(layer[c], c);
  const layers = owner.layers.map((y) => (y.id === layerId ? nextLayer : y));
  if (isNoise(owner)) {
    const visible = edit(owner.visible, 'visible');
    const active = edit(owner.active, 'active');
    if (!changed || invalid) return chart;
    return mapNoise(chart, ownerId, (f) => ({ ...f, layers, visible, active }));
  }
  const next = { ...owner, layers, color: edit(owner.color, 'color') };
  if (isText(owner)) {
    let value = edit(owner.value, 'value');
    // UI texts always keep a value event.
    if (owner.builtin && owner.value.length && !value.length) value = owner.value.slice(0, 1);
    (next as TextObject).value = value;
    (next as TextObject).font = edit(owner.font, 'font');
  } else if (isMedia(owner)) {
    (next as MediaObject).starts = edit(owner.starts, 'start');
  }
  if (!changed || invalid) return chart;
  return mapOwner(chart, ownerId, () => next as never);
}

const has = (events: AnyEvent[], ids: Set<Id>) => events.some((e) => ids.has(e.id));

// Maps the matching events of the given tracks.
const mapIds =
  (ids: Id[], fn: (e: AnyEvent) => AnyEvent, keys?: (key: TrackKey) => boolean): TrackEdit =>
  (events, key) => {
    const set = new Set(ids);
    if ((keys && !keys(key)) || !has(events, set)) return events;
    return events.map((e) => (set.has(e.id) ? fn(e) : e));
  };

export const addEvents = (chart: Chart, ownerId: Id, layerId: Id | null, items: EventItem[]) =>
  editEvents(
    chart,
    ownerId,
    layerId,
    (events, key) => {
      const added = items.filter((i) => i.channel === key).map((i) => i.event);
      return added.length ? [...events, ...added] : events;
    },
    items.flatMap((i) => (isVarKey(i.channel) ? [i.channel.slice(4)] : [])),
  );

export const addEvent = (chart: Chart, ownerId: Id, layerId: Id | null, item: EventItem) =>
  addEvents(chart, ownerId, layerId, [item]);

export const removeEvents = (chart: Chart, ownerId: Id, layerId: Id | null, ids: Id[]) => {
  const set = new Set(ids);
  return editEvents(chart, ownerId, layerId, (events) =>
    has(events, set) ? events.filter((e) => !set.has(e.id)) : events,
  );
};

// `fn` only changes timing, so it applies to every track.
export const retimeEvents = (
  chart: Chart,
  ownerId: Id,
  layerId: Id | null,
  ids: Id[],
  fn: <T>(e: Event<T>) => Event<T>,
) => editEvents(chart, ownerId, layerId, mapIds(ids, fn));

// Numeric events (layer channels and media starts).
export const updateEvents = (
  chart: Chart,
  ownerId: Id,
  layerId: Id | null,
  ids: Id[],
  fn: (e: NumEvent) => NumEvent,
) =>
  editEvents(
    chart,
    ownerId,
    layerId,
    mapIds(
      ids,
      (e) => fn(e as NumEvent),
      (key) => key !== 'value' && key !== 'font' && key !== 'color',
    ),
  );

export const updateTextEvents = (
  chart: Chart,
  ownerId: Id,
  layerId: Id | null,
  ids: Id[],
  fn: (e: TextEvent) => TextEvent,
) =>
  editEvents(
    chart,
    ownerId,
    layerId,
    mapIds(
      ids,
      (e) => fn(e as TextEvent),
      (key) => key === 'value' || key === 'font',
    ),
  );

export const updateColorEvents = (
  chart: Chart,
  ownerId: Id,
  layerId: Id | null,
  ids: Id[],
  fn: (e: ColorEvent) => ColorEvent,
) =>
  editEvents(
    chart,
    ownerId,
    layerId,
    mapIds(
      ids,
      (e) => fn(e as ColorEvent),
      (key) => key === 'color',
    ),
  );

export const moveEvents = (chart: Chart, ownerId: Id, layerId: Id | null, ids: Id[], dBeat: Beat) =>
  retimeEvents(chart, ownerId, layerId, ids, (e) => ({
    ...e,
    start: add(e.start, dBeat),
    end: add(e.end, dBeat),
  }));
