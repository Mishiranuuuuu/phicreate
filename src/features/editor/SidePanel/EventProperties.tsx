import { useEffect, useRef } from 'react';
import { cmp, format, parse } from '@/features/chart/model/beat';
import { isColor, parseColor, toHex } from '@/features/chart/model/color';
import {
  DEFAULT_FONT,
  isNoise,
  isShader,
  type Color,
  type ColorEvent,
  type Event,
  type NumEvent,
  type TextEvent,
} from '@/features/chart/model/types';
import {
  findOwner,
  retimeEvents,
  updateColorEvents,
  updateEvents,
  updateTextEvents,
} from '@/features/chart/runtime/commands';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import { useLibraryStore } from '@/features/library/useLibraryStore';
import { parseNumber } from '@/lib/number';
import { CommitInput } from '../CommitInput';
import { useEditorStore } from '../useEditorStore';
import { columnsFor, ownerEvents } from '../events';
import { EasingSelect } from './EasingSelect';
import { Check, Row } from './fields';
import styles from './SidePanel.module.css';

// Edits the selected events; mixed values show blank and apply to all on commit.
export function EventProperties() {
  const ownerId = useEditorStore((s) => s.selectedObjectId ?? s.selectedLineId);
  const ids = useEditorStore((s) => s.selectedEventIds);
  const layerId = useEditorStore((s) => s.selectedLayerId);
  const owner = useChartStore((s) =>
    s.chart && ownerId ? findOwner(s.chart, ownerId) : undefined,
  );
  const apply = useChartStore((s) => s.apply);
  const library = useLibraryStore((s) => s.fonts);
  const layer =
    owner && !isShader(owner)
      ? (owner.layers.find((y) => y.id === layerId) ?? owner.layers[0])
      : null;

  const selected = owner ? ownerEvents(owner, layer).filter((x) => ids.includes(x.event.id)) : [];
  if (!owner || !selected.length) {
    return <p className={styles.muted}>No event selected.</p>;
  }
  const targetLayer = layer?.id ?? null;

  // Numeric events (channels, media starts), text value events and color events.
  const nums = selected.flatMap((x) =>
    x.channel === 'value' || x.channel === 'font' || x.channel === 'color' ? [] : [x.event],
  );
  const texts = selected.flatMap((x) => (x.channel === 'value' ? [x.event] : []));
  const fonts = selected.flatMap((x) => (x.channel === 'font' ? [x.event] : []));
  const rangesOnly = selected.every((x) => x.channel === 'active' || x.channel === 'visible');
  // Noise field active ranges keep the ready flash length in `from`.
  const flashes = isNoise(owner) && selected.every((x) => x.channel === 'active');
  const colors = selected.flatMap((x) => (x.channel === 'color' ? [x.event] : []));
  const events: Event<number | string | Color>[] = [...nums, ...texts, ...fonts, ...colors];
  const fontsOnly = fonts.length === events.length;
  // Library fonts, plus any name a deleted font left in an event.
  const fontNames = [
    ...new Set([DEFAULT_FONT, ...Object.keys(library), ...fonts.map((e) => e.from)]),
  ].filter(Boolean);
  const retime = (fn: <T>(e: Event<T>) => Event<T>) =>
    apply((c) => retimeEvents(c, owner.id, targetLayer, ids, fn));
  // One history entry for every event kind.
  const update = (
    numFn: (e: NumEvent) => NumEvent,
    textFn: (e: TextEvent) => TextEvent,
    colorFn: (e: ColorEvent) => ColorEvent,
  ) =>
    apply((c) => {
      const next = updateTextEvents(
        updateEvents(c, owner.id, targetLayer, ids, numFn),
        owner.id,
        targetLayer,
        ids,
        textFn,
      );
      return updateColorEvents(next, owner.id, targetLayer, ids, colorFn);
    });
  const shared = <T,>(get: (e: Event<number | string | Color>) => T) =>
    events.every((e) => get(e) === get(events[0])) ? get(events[0]) : undefined;
  const show = (v: number | string | Color) => (isColor(v) ? toHex(v) : String(v));
  const single = selected.length === 1 ? selected[0] : null;
  const easing = shared((e) => (e.easing.kind === 'preset' ? e.easing.id : -1));

  const set = <T,>(e: Event<T>, key: 'from' | 'to', v: T): Event<T> =>
    e.locked ? { ...e, from: v, to: v } : { ...e, [key]: v };

  const field = (key: 'from' | 'to', label: string) => {
    const value = shared((e) => show(e[key]));
    const commit = (text: string) => {
      const v = parseNumber(text);
      const color = parseColor(text);
      if ((nums.length && v === null) || (colors.length && !color)) return false;
      update(
        (e) => (v === null ? e : set(e, key, v)),
        (e) => set(e, key, text),
        (e) => (color ? set(e, key, color) : e),
      );
    };
    const input = (
      <CommitInput
        value={value ?? ''}
        placeholder="—"
        inputMode={texts.length || fonts.length || colors.length ? 'text' : 'decimal'}
        onCommit={commit}
      />
    );
    return (
      <Row label={label}>
        {colors.length === events.length ? (
          <span className={styles.colorField}>
            <ColorPicker key={value} value={value ?? '#ffffff'} onCommit={commit} />
            {input}
          </span>
        ) : (
          input
        )}
      </Row>
    );
  };

  return (
    <div className={styles.props}>
      <p className={styles.muted}>
        {single ? columnsFor(owner)[single.column].label : `${selected.length} events selected`}
      </p>
      {single && (
        <>
          <Row label="Start">
            <CommitInput
              value={format(single.event.start)}
              onCommit={(text) => {
                const start = parse(text);
                if (!start || cmp(start, single.event.end) >= 0) return false;
                retime((e) => ({ ...e, start }));
              }}
            />
          </Row>
          <Row label="End">
            <CommitInput
              value={format(single.event.end)}
              onCommit={(text) => {
                const end = parse(text);
                if (!end || cmp(end, single.event.start) <= 0) return false;
                retime((e) => ({ ...e, end }));
              }}
            />
          </Row>
        </>
      )}
      {flashes && field('from', 'Ready flash (s)')}
      {fontsOnly && (
        <Row label="Font">
          <select
            value={shared((e) => String(e.from)) ?? ''}
            onChange={(e) => {
              const font = e.target.value;
              const fn = (ev: TextEvent): TextEvent => ({ ...ev, from: font, to: font });
              update((n) => n, fn, (c) => c);
            }}
          >
            {shared((e) => String(e.from)) === undefined && <option value="">—</option>}
            {fontNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Row>
      )}
      {/* Shader active ranges, noise field ranges and fonts have timing only. */}
      {!rangesOnly && !fontsOnly && (
        <>
          {field('from', 'From')}
          {field('to', 'To')}
          <Check
            label="Locked (from = to)"
            checked={shared((e) => !!e.locked) ?? false}
            onChange={(locked) => {
              const fn = <T,>(e: Event<T>): Event<T> =>
                locked ? { ...e, locked, to: e.from } : { ...e, locked };
              update(fn, fn, fn);
            }}
          />
          <Row label="Easing">
            <EasingSelect
              value={easing === -1 ? undefined : easing}
              extra={easing === -1 ? 'Bézier' : undefined}
              onChange={(id) => retime((e) => ({ ...e, easing: { kind: 'preset', id } }))}
            />
          </Row>
        </>
      )}
    </div>
  );
}

// Native picker; commits once when the picker closes, not on every drag. Remount (key) to reset.
function ColorPicker({ value, onCommit }: { value: string; onCommit: (hex: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  useEffect(() => {
    const el = ref.current!;
    const onChange = () => commitRef.current(el.value);
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, []);
  return <input ref={ref} type="color" defaultValue={value} />;
}
