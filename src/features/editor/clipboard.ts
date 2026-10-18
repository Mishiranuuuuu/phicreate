import { add, cmp, fromFloat, sub } from '@/features/chart/model/beat';
import type { Beat, EventItem, Note } from '@/features/chart/model/types';
import { addEvents, addNotes, removeEvents, removeNotes } from '@/features/chart/runtime/commands';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import { create } from 'zustand';
import { createId } from '@/lib/id';
import { hover } from './grid/hover';
import { columnsFor, ownerEvents } from './events';
import { currentLine, currentOwner, currentTarget } from './grid/useGridCanvas';
import { musicTimeToBeat } from './time';
import { useEditorStore } from './useEditorStore';

// In-memory; items hold beats relative to the earliest copied item.
export type Clip = { kind: 'notes'; notes: Note[] } | { kind: 'events'; events: EventItem[] };

export const useClipboard = create<{ clip: Clip | null }>(() => ({ clip: null }));
const setClip = (clip: Clip | null) => useClipboard.setState({ clip });
export const clearClipboard = () => setClip(null);

const earliest = (beats: Beat[]) => beats.reduce((m, b) => (cmp(b, m) < 0 ? b : m));

export function copySelection(cut = false) {
  const editor = useEditorStore.getState();
  const charts = useChartStore.getState();
  const line = currentLine(charts.chart);

  if (editor.activeGrid === 'events') {
    const target = currentTarget(charts.chart);
    const ids = new Set(editor.selectedEventIds);
    if (!target || !ids.size) return;
    const items = ownerEvents(target.owner, target.layer).filter((x) => ids.has(x.event.id));
    if (!items.length) return;
    const origin = earliest(items.map((i) => i.event.start));
    setClip({
      kind: 'events',
      events: items.map(({ channel, event }) => ({
        channel,
        event: { ...event, start: sub(event.start, origin), end: sub(event.end, origin) },
      })) as EventItem[],
    });
    if (cut) {
      charts.apply((c) => removeEvents(c, target.owner.id, target.layerId, [...ids]));
      editor.selectEvents([]);
    }
    return;
  }

  if (!line) return;

  const ids = new Set(editor.selectedNoteIds);
  const notes = line.notes.filter((n) => ids.has(n.id));
  if (!notes.length) return;
  const origin = earliest(notes.map((n) => n.beat));
  setClip({
    kind: 'notes',
    notes: notes.map((n) => ({
      ...n,
      beat: sub(n.beat, origin),
      endBeat: n.endBeat && sub(n.endBeat, origin),
    })),
  });
  if (cut) {
    charts.apply((c) => removeNotes(c, line.id, [...ids]));
    editor.selectNotes([]);
  }
}

// Pastes at the mouse (snapped); falls back to the playhead when the mouse is elsewhere.
export function pasteClipboard() {
  const editor = useEditorStore.getState();
  const charts = useChartStore.getState();
  const owner = currentOwner(charts.chart);
  const { clip } = useClipboard.getState();
  if (!clip || !charts.chart || !owner) return;
  const target = clip.kind === 'events' ? 'events' : 'notes';
  const at =
    hover.grid === target && hover.beat
      ? hover.beat
      : fromFloat(Math.max(0, musicTimeToBeat(charts.chart, editor.time)), editor.division);

  if (clip.kind === 'events') {
    const target = currentTarget(charts.chart);
    if (!target) return;
    const channels = new Set(columnsFor(owner).map((c) => c.channel));
    const items = clip.events
      .filter((i) => channels.has(i.channel))
      .map(({ channel, event }) => ({
        channel,
        event: { ...event, id: createId(), start: add(event.start, at), end: add(event.end, at) },
      })) as EventItem[];
    const before = charts.chart;
    // Rejected as a whole if any channel would overlap.
    charts.apply((c) => addEvents(c, owner.id, target.layerId, items));
    if (useChartStore.getState().chart !== before) {
      editor.set({ activeGrid: 'events' });
      editor.selectEvents(items.map((i) => i.event.id));
    }
    return;
  }

  if (!('notes' in owner)) return;
  const notes = clip.notes.map((n) => ({
    ...n,
    id: createId(),
    beat: add(n.beat, at),
    endBeat: n.endBeat && add(n.endBeat, at),
  }));
  charts.apply((c) => addNotes(c, owner.id, notes));
  editor.set({ activeGrid: 'notes' });
  editor.selectNotes(notes.map((n) => n.id));
}
