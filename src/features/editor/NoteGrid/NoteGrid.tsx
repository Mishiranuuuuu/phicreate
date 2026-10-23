import { useEffect, useRef } from 'react';
import { add, cmp, fromFloat, sub, toFloat, ZERO } from '@/features/chart/model/beat';
import { CANVAS_WIDTH, createNote } from '@/features/chart/model/defaults';
import type { Beat, JudgeLine, Note, NoteType } from '@/features/chart/model/types';
import {
  addNotes,
  hasNoteAt,
  isLineLocked,
  moveNotes,
  removeNotes,
} from '@/features/chart/runtime/commands';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { setHover } from '../grid/hover';
import { useEditorStore } from '../useEditorStore';
import { isTyping } from '../useEditorShortcuts';
import { FREE_DENSITY, PLACE_KEYS, type NoteDefaults } from '../types';
import { laneXs, segmentHitsRect, snapX, type GridGeometry } from '../grid/geometry';
import {
  drawBox,
  drawFooterStrip,
  drawStroke,
  drawHeaderStrip,
  FOOTER_HEIGHT,
  drawTimeGrid,
  outsideGrid,
  type Palette,
} from '../grid/timeGrid';
import { currentLine, GRID_BACKDROP, useGridCanvas, type GridFrame } from '../grid/useGridCanvas';
import { drawNote } from './draw';
import styles from './NoteGrid.module.css';

interface Pointer {
  beat: Beat; // snapped, >= 0
  beatF: number;
  x: number; // snapped
  xF: number;
  px: number;
  py: number;
}

type Drag =
  | { kind: 'move'; start: Pointer; dBeat: Beat; dx: number; ids: string[] }
  | { kind: 'box'; b0: number; x0: number; b1: number; x1: number; base: string[] }
  | { kind: 'line'; points: { beat: number; x: number }[]; base: string[]; hits: Set<string> };

export function NoteGrid() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<Pointer | null>(null);
  const dragRef = useRef<Drag | null>(null);
  // First R press of a two-press hold.
  const pendingRef = useRef<{ beat: Beat; x: number } | null>(null);
  const hasLines = useChartStore((s) => !!s.chart?.lines.length);

  const draw = ({ ctx, g, palette, chart, editor }: GridFrame) => {
    const lanes = (editor.snapX ? laneXs(editor.lanes) : []).map((x) => ({
      px: g.xToPx(x),
      strong: x === 0,
    }));
    drawTimeGrid(
      ctx,
      g,
      palette,
      editor.snapY ? editor.division : 1,
      lanes,
      editor.previewBehind ? GRID_BACKDROP : 1,
      chart.timeTags,
      chart,
    );

    const line = currentLine(chart);
    if (!line) return drawChrome(ctx, g, palette, null);
    const locked = isLineLocked(chart, line.id);
    const drag = dragRef.current;
    const selected = new Set(editor.selectedNoteIds);
    const moving = drag?.kind === 'move' ? new Set(drag.ids) : null;

    for (const n of line.notes) {
      drawNote(ctx, g, n, { selected: selected.has(n.id) && !moving?.has(n.id) });
    }

    const hover = hoverRef.current;
    const pending = pendingRef.current;
    if (drag?.kind === 'move') {
      const dBeat = toFloat(drag.dBeat);
      for (const n of line.notes) {
        if (moving!.has(n.id)) drawNote(ctx, g, n, { selected: true, dBeat, dx: drag.dx });
      }
    } else if (drag?.kind === 'box') {
      drawBox(
        ctx,
        palette,
        g.xToPx(drag.x0),
        g.beatToY(drag.b0),
        g.xToPx(drag.x1),
        g.beatToY(drag.b1),
      );
    } else if (drag?.kind === 'line') {
      drawStroke(
        ctx,
        palette,
        drag.points.map((q) => [g.xToPx(q.x), g.beatToY(q.beat)]),
      );
    } else if (pending && !locked) {
      const end = hover ? holdEnd(pending.beat, hover.beat, editor.division) : undefined;
      drawNote(ctx, g, ghostNote('hold', pending.beat, pending.x, editor.noteDefaults, end));
    }
    const total = chart.lines.reduce((n, l) => n + l.notes.length, 0);
    drawChrome(
      ctx,
      g,
      palette,
      `${total} note${total === 1 ? '' : 's'} total${locked ? ' · locked' : ''}`,
    );
  };

  const geoRef = useGridCanvas(wrapRef, canvasRef, draw);

  // Q/W/E: place at cursor. R: press at the start, press again at the end.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
      if (e.key === 'Escape') pendingRef.current = null;
      const type = PLACE_KEYS[e.key.toLowerCase()];
      const hover = hoverRef.current;
      if (!type || !hover || e.repeat) return;
      const chart = useChartStore.getState().chart;
      const line = currentLine(chart);
      if (!chart || !line || isLineLocked(chart, line.id)) return;
      if (type !== 'hold') return placeNote(type, hover.beat, hover.x);
      const pending = pendingRef.current;
      if (!pending) {
        pendingRef.current = { beat: hover.beat, x: hover.x };
        return;
      }
      pendingRef.current = null;
      const { division } = useEditorStore.getState();
      placeNote('hold', pending.beat, pending.x, holdEnd(pending.beat, hover.beat, division));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pointerAt = (e: React.PointerEvent): Pointer | null => {
    const g = geoRef.current;
    if (!g) return null;
    const [px, py] = g.point(canvasRef.current!, e);
    const { division, lanes, snapX: snap, snapY } = useEditorStore.getState();
    const beatF = g.yToBeat(py);
    const xF = g.pxToX(px);
    let beat = fromFloat(beatF, snapY && !e.altKey ? division : FREE_DENSITY);
    if (cmp(beat, ZERO) < 0) beat = ZERO;
    return { beat, beatF, x: snapX(xF, lanes, snap && !e.altKey), xF, px, py };
  };

  const hitTest = (line: JudgeLine, p: Pointer): Note | null => {
    const g = geoRef.current!;
    for (let i = line.notes.length - 1; i >= 0; i--) {
      const r = g.noteRect(line.notes[i]);
      if (p.px >= r.left && p.px <= r.right && p.py >= r.top - 3 && p.py <= r.bottom + 3) {
        return line.notes[i];
      }
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    useEditorStore.getState().set({ activeGrid: 'notes' });
    const p = pointerAt(e);
    const charts = useChartStore.getState();
    const editor = useEditorStore.getState();
    const line = currentLine(charts.chart);
    if (!p || !line || !charts.chart || outsideGrid(geoRef.current!, p.py)) return;
    const locked = isLineLocked(charts.chart, line.id);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (e.button === 2) {
      if (locked) return;
      const hit = hitTest(line, p);
      if (hit) {
        charts.apply((c) => removeNotes(c, line.id, [hit.id]));
        editor.selectNotes(editor.selectedNoteIds.filter((id) => id !== hit.id));
      }
      return;
    }
    if (e.button !== 0) return;

    const hit = hitTest(line, p);
    const selected = editor.selectedNoteIds;
    if (hit) {
      if (e.shiftKey && selected.includes(hit.id)) {
        editor.selectNotes(selected.filter((id) => id !== hit.id));
        return;
      }
      const ids = selected.includes(hit.id)
        ? selected
        : e.shiftKey
          ? [...selected, hit.id]
          : [hit.id];
      editor.selectNotes(ids);
      if (!locked) dragRef.current = { kind: 'move', start: p, dBeat: ZERO, dx: 0, ids };
    } else {
      const base = e.shiftKey ? selected : [];
      editor.selectNotes(base);
      dragRef.current =
        useSettingsStore.getState().settings.selectMode === 'line'
          ? { kind: 'line', points: [{ beat: p.beatF, x: p.xF }], base, hits: new Set() }
          : { kind: 'box', b0: p.beatF, x0: p.xF, b1: p.beatF, x1: p.xF, base };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointerAt(e);
    hoverRef.current = p && !outsideGrid(geoRef.current!, p.py) ? p : null;
    setHover('notes', hoverRef.current?.beat ?? null);
    const drag = dragRef.current;
    if (!p || !drag) return;

    if (drag.kind === 'move') {
      const line = currentLine(useChartStore.getState().chart);
      let dBeat = sub(p.beat, drag.start.beat);
      // Keep every moved note at beat >= 0.
      const min = line?.notes
        .filter((n) => drag.ids.includes(n.id))
        .reduce<Beat | null>((m, n) => (!m || cmp(n.beat, m) < 0 ? n.beat : m), null);
      if (min && cmp(add(min, dBeat), ZERO) < 0) dBeat = sub(ZERO, min);
      drag.dBeat = dBeat;
      drag.dx = p.x - drag.start.x;
    } else if (drag.kind === 'line') {
      // Select every note the stroke passes through.
      const g = geoRef.current!;
      const line = currentLine(useChartStore.getState().chart);
      const prev = drag.points[drag.points.length - 1];
      drag.points.push({ beat: p.beatF, x: p.xF });
      if (!line) return;
      const [ax, ay] = [g.xToPx(prev.x), g.beatToY(prev.beat)];
      for (const n of line.notes) {
        if (drag.hits.has(n.id)) continue;
        const r = g.noteRect(n);
        const hit = { ...r, top: r.top - 3, bottom: r.bottom + 3 };
        if (segmentHitsRect(ax, ay, p.px, p.py, hit)) drag.hits.add(n.id);
      }
      useEditorStore.getState().selectNotes([...new Set([...drag.base, ...drag.hits])]);
    } else {
      drag.b1 = p.beatF;
      drag.x1 = p.xF;
      const line = currentLine(useChartStore.getState().chart);
      if (!line) return;
      const [b0, b1] = [Math.min(drag.b0, drag.b1), Math.max(drag.b0, drag.b1)];
      const [x0, x1] = [Math.min(drag.x0, drag.x1), Math.max(drag.x0, drag.x1)];
      const inside = line.notes
        .filter((n) => {
          const b = toFloat(n.beat);
          return b >= b0 && b <= b1 && n.x >= x0 && n.x <= x1;
        })
        .map((n) => n.id);
      useEditorStore.getState().selectNotes([...new Set([...drag.base, ...inside])]);
    }
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const { selectedLineId } = useEditorStore.getState();
    if (!selectedLineId) return;

    if (drag.kind === 'move' && (drag.dx !== 0 || cmp(drag.dBeat, ZERO) !== 0)) {
      useChartStore
        .getState()
        .apply((c) => moveNotes(c, selectedLineId, drag.ids, drag.dBeat, drag.dx));
    }
  };

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (dragRef.current = null)}
        onPointerLeave={() => {
          hoverRef.current = null;
          setHover('notes', null);
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {!hasLines && <p className={styles.empty}>Add a judge line to start placing notes.</p>}
    </div>
  );
}

function drawChrome(
  ctx: CanvasRenderingContext2D,
  g: GridGeometry,
  p: Palette,
  info: string | null,
) {
  drawHeaderStrip(ctx, g, p);
  const cx = (g.x0 + g.x1) / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillStyle = p.accent;
  ctx.fillText('Notes', cx, 11);
  ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.fillStyle = p.muted;
  ctx.fillText(info ?? 'No line', cx, 25);
  drawRuler(ctx, g, p);
}

// Footer ruler: the note grid spans the full chart width.
function drawRuler(ctx: CanvasRenderingContext2D, g: GridGeometry, p: Palette) {
  drawFooterStrip(ctx, g, p);
  const half = CANVAS_WIDTH / 2;
  const top = g.height - FOOTER_HEIGHT;
  const y = top + 11;
  ctx.strokeStyle = p.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(g.x0 + 0.5, y + 0.5);
  ctx.lineTo(g.x1 - 0.5, y + 0.5);
  for (const x of [-half, 0, half]) {
    const px = Math.round(g.xToPx(x)) + 0.5;
    ctx.moveTo(px, y - 4);
    ctx.lineTo(px, y + 5);
  }
  ctx.stroke();
  ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.fillStyle = p.muted;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(String(-half), g.x0, top + 25);
  ctx.textAlign = 'center';
  ctx.fillText('0', g.xToPx(0), top + 25);
  ctx.textAlign = 'right';
  ctx.fillText(String(half), g.x1, top + 25);
}

// At least one division after the start.
function holdEnd(start: Beat, end: Beat, division: number): Beat {
  const min = add(start, [0, 1, division]);
  return cmp(end, min) < 0 ? min : end;
}

const ghostNote = (
  type: NoteType,
  beat: Beat,
  x: number,
  defaults: NoteDefaults,
  endBeat?: Beat,
): Note =>
  createNote({
    ...defaults,
    type,
    beat,
    x,
    endBeat: type === 'hold' ? (endBeat ?? add(beat, [1, 0, 1])) : undefined,
  });

function placeNote(type: NoteType, beat: Beat, x: number, endBeat?: Beat) {
  const charts = useChartStore.getState();
  const editor = useEditorStore.getState();
  const line = currentLine(charts.chart);
  if (!line || hasNoteAt(line, type, beat, x)) return;
  const note = ghostNote(type, beat, x, editor.noteDefaults, endBeat);
  charts.apply((c) => addNotes(c, line.id, [note]));
  editor.selectNotes([note.id]);
}
