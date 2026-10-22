import { cmp, format, parse } from '@/features/chart/model/beat';
import { parseColor, toHex } from '@/features/chart/model/color';
import { NOTE_TYPES, type Note } from '@/features/chart/model/types';
import { updateNotes } from '@/features/chart/runtime/commands';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import { parseNumber } from '@/lib/number';
import { CommitInput } from '../CommitInput';
import { useEditorStore } from '../useEditorStore';
import { Check, ColorPicker, Row } from './fields';
import styles from './SidePanel.module.css';

type NumKey = 'x' | 'speed' | 'alpha' | 'size' | 'yOffset';

const NUM_FIELDS: { key: NumKey; label: string; min?: number; max?: number }[] = [
  { key: 'x', label: 'X' },
  { key: 'speed', label: 'Speed' },
  { key: 'alpha', label: 'Alpha', min: 0, max: 255 },
  { key: 'size', label: 'Size', min: 0 },
  { key: 'yOffset', label: 'Y offset' },
];

const EMPTY: Note[] = [];

// Edits the selection; mixed values show blank and apply to all on commit.
export function NoteProperties() {
  const lineId = useEditorStore((s) => s.selectedLineId);
  const ids = useEditorStore((s) => s.selectedNoteIds);
  const lineNotes = useChartStore(
    (s) => s.chart?.lines.find((l) => l.id === lineId)?.notes ?? EMPTY,
  );
  const apply = useChartStore((s) => s.apply);
  const notes = lineNotes.filter((n) => ids.includes(n.id));

  if (!lineId || !notes.length) return <p className={styles.muted}>No note selected.</p>;

  const update = (fn: (n: Note) => Note) =>
    apply((c) =>
      updateNotes(
        c,
        lineId,
        notes.map((n) => n.id),
        fn,
      ),
    );
  const shared = <T,>(get: (n: Note) => T) =>
    notes.every((n) => get(n) === get(notes[0])) ? get(notes[0]) : undefined;
  const single = notes.length === 1 ? notes[0] : null;
  const type = shared((n) => n.type);
  const visibleTime = shared((n) => n.visibleTime);
  const tint = shared((n) => toHex(n.tint ?? [255, 255, 255]));

  const commitTint = (text: string) => {
    const s = text.trim();
    if (!s) {
      update((n) => ({ ...n, tint: undefined }));
      return;
    }
    const color = parseColor(s);
    if (!color) return false;
    const next = color[0] === 255 && color[1] === 255 && color[2] === 255 ? undefined : color;
    update((n) => ({ ...n, tint: next }));
  };

  return (
    <div className={styles.props}>
      {notes.length > 1 && <p className={styles.muted}>{notes.length} notes selected</p>}
      <Row label="Type">
        <select
          value={type ?? ''}
          onChange={(e) => update((n) => ({ ...n, type: e.target.value as Note['type'] }))}
        >
          {!type && <option value="">—</option>}
          {NOTE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Row>

      {single && (
        <Row label="Beat">
          <CommitInput
            value={format(single.beat)}
            onCommit={(text) => {
              const beat = parse(text);
              if (!beat || beat[0] < 0) return false;
              update((n) => ({ ...n, beat }));
            }}
          />
        </Row>
      )}
      {single?.type === 'hold' && single.endBeat && (
        <Row label="End beat">
          <CommitInput
            value={format(single.endBeat)}
            onCommit={(text) => {
              const endBeat = parse(text);
              if (!endBeat || cmp(endBeat, single.beat) <= 0) return false;
              update((n) => ({ ...n, endBeat }));
            }}
          />
        </Row>
      )}

      {NUM_FIELDS.map(({ key, label, min, max }) => {
        const value = shared((n) => n[key]);
        return (
          <Row key={key} label={label}>
            <CommitInput
              value={value === undefined ? '' : String(value)}
              placeholder="—"
              inputMode="decimal"
              onCommit={(text) => {
                const v = parseNumber(text);
                if (
                  v === null ||
                  (min !== undefined && v < min) ||
                  (max !== undefined && v > max)
                ) {
                  return false;
                }
                update((n) => ({ ...n, [key]: v }));
              }}
            />
          </Row>
        );
      })}

      <Row label="Visible time (s)">
        <CommitInput
          value={
            visibleTime === undefined || !Number.isFinite(visibleTime) ? '' : String(visibleTime)
          }
          placeholder={visibleTime === undefined ? '—' : '∞'}
          inputMode="decimal"
          onCommit={(text) => {
            const s = text.trim();
            if (!s || s === '∞') {
              update((n) => ({ ...n, visibleTime: Infinity }));
              return;
            }
            const v = parseNumber(s);
            if (v === null || v < 0) return false;
            update((n) => ({ ...n, visibleTime: v >= 999999 ? Infinity : v }));
          }}
        />
      </Row>

      <Row label="Tint">
        <span className={styles.colorField}>
          <ColorPicker key={tint} value={tint ?? '#ffffff'} onCommit={commitTint} />
          <CommitInput value={tint ?? ''} placeholder="—" onCommit={commitTint} />
        </span>
      </Row>

      <Check
        label="Above line"
        checked={shared((n) => n.above) ?? false}
        onChange={(above) => update((n) => ({ ...n, above }))}
      />
      <Check
        label="Fake"
        checked={shared((n) => n.fake) ?? false}
        onChange={(fake) => update((n) => ({ ...n, fake }))}
      />
    </div>
  );
}
