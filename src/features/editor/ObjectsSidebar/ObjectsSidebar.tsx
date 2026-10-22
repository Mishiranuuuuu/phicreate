import { memo, useCallback, useState, type ReactNode } from 'react';
import { EyeIcon, EyeOffIcon, LockIcon, UnlockIcon } from '@/components/ui';
import { add, fromFloat } from '@/features/chart/model/beat';
import {
  addEffect,
  addLine,
  addMedia,
  addNoiseField,
  addText,
  patchLineDisplay,
  removeEffect,
  removeLine,
  removeMedia,
  removeNoiseField,
  removeText,
} from '@/features/chart/runtime/commands';
import {
  createActiveEvent,
  createEffect,
  createLine,
  createMedia,
  createNoiseField,
  createText,
} from '@/features/chart/model/defaults';
import type { NoiseField } from '@/features/chart/model/types';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import { PRESET_NAMES } from '@/features/shaders/library';
import { musicTimeToBeat } from '../time';
import { useEditorStore } from '../useEditorStore';
import styles from './ObjectsSidebar.module.css';

// Order: judge lines, UI elements, text, media, shaders, noise fields.
export function ObjectsSidebar() {
  const [groupFilter, setGroupFilter] = useState('');
  const lines = useChartStore((s) => s.chart?.lines);
  const lineGroups = useChartStore((s) => s.chart?.lineGroups);
  const lineMeta = useChartStore((s) => s.chart?.editor.lines);
  const allTexts = useChartStore((s) => s.chart?.texts);
  const texts = allTexts?.filter((t) => !t.builtin);
  const uiTexts = allTexts?.filter((t) => t.builtin);
  const media = useChartStore((s) => s.chart?.media);
  const effects = useChartStore((s) => s.chart?.effects);
  const noiseFields = useChartStore((s) => s.chart?.noiseFields);
  const apply = useChartStore((s) => s.apply);
  const selectedLineId = useEditorStore((s) => s.selectedLineId);
  const selectedObjectId = useEditorStore((s) => s.selectedObjectId);
  const selectLine = useEditorStore((s) => s.selectLine);
  const selectObject = useEditorStore((s) => s.selectObject);
  const setEditor = useEditorStore((s) => s.set);

  const activeGroupFilter = lineGroups?.some((g) => g.id === groupFilter) ? groupFilter : '';
  const visibleLines = activeGroupFilter
    ? lines?.filter((l) => l.groupId === activeGroupFilter)
    : lines;

  const openLine = (id: string) => {
    selectLine(id);
    setEditor({ objectPanelOpen: true });
  };
  const openObject = useCallback(
    (id: string) => {
      selectObject(id);
      setEditor({ objectPanelOpen: true });
    },
    [selectObject, setEditor],
  );

  const addNewLine = () => {
    const line = createLine(`Line ${lines?.length ?? 0}`);
    if (activeGroupFilter) line.groupId = activeGroupFilter;
    apply((c) => addLine(c, line));
    selectLine(line.id);
  };

  const removeSelectedLine = () => {
    if (!selectedLineId || !lines || lineMeta?.[selectedLineId]?.locked) return;
    const index = lines.findIndex((l) => l.id === selectedLineId);
    const next = lines[index + 1] ?? lines[index - 1] ?? null;
    apply((c) => removeLine(c, selectedLineId));
    selectLine(next?.id ?? null);
  };

  const addNewText = () => {
    const text = createText(`Text ${texts?.length ?? 0}`);
    apply((c) => addText(c, text));
    selectObject(text.id);
  };

  const removeSelectedText = () => {
    if (!selectedObjectId || !texts?.some((t) => t.id === selectedObjectId)) return;
    const index = texts.findIndex((t) => t.id === selectedObjectId);
    const next = texts[index + 1] ?? texts[index - 1] ?? null;
    apply((c) => removeText(c, selectedObjectId));
    if (next) selectObject(next.id);
    else selectLine(lines?.[0]?.id ?? null);
  };

  const addNewMedia = () => {
    const item = createMedia(`Media ${media?.length ?? 0}`);
    apply((c) => addMedia(c, item));
    openObject(item.id);
  };

  const removeSelectedMedia = () => {
    if (!selectedObjectId || !media?.some((m) => m.id === selectedObjectId)) return;
    const index = media.findIndex((m) => m.id === selectedObjectId);
    const next = media[index + 1] ?? media[index - 1] ?? null;
    apply((c) => removeMedia(c, selectedObjectId));
    if (next) selectObject(next.id);
    else selectLine(lines?.[0]?.id ?? null);
  };

  // One object per shader: takes the first unused preset, active for 4 beats at the playhead.
  const addNewEffect = () => {
    const { chart } = useChartStore.getState();
    const { time, division } = useEditorStore.getState();
    const shader = PRESET_NAMES.find((n) => !effects?.some((e) => e.shader === n));
    if (!chart || !shader) return;
    const effect = createEffect(shader, shader);
    const start = fromFloat(Math.max(0, musicTimeToBeat(chart, time)), division);
    effect.active = [createActiveEvent(start, add(start, [4, 0, 1]))];
    apply((c) => addEffect(c, effect));
    openObject(effect.id);
  };

  const removeSelectedEffect = () => {
    if (!selectedObjectId || !effects?.some((e) => e.id === selectedObjectId)) return;
    const index = effects.findIndex((e) => e.id === selectedObjectId);
    const next = effects[index + 1] ?? effects[index - 1] ?? null;
    apply((c) => removeEffect(c, selectedObjectId));
    if (next) selectObject(next.id);
    else selectLine(lines?.[0]?.id ?? null);
  };

  // Shown for 4 beats at the playhead.
  const addNewNoiseField = () => {
    const { chart } = useChartStore.getState();
    const { time, division } = useEditorStore.getState();
    if (!chart) return;
    const start = fromFloat(Math.max(0, musicTimeToBeat(chart, time)), division);
    const field = createNoiseField(`Noise field ${chart.noiseFields.length}`, start);
    apply((c) => addNoiseField(c, field));
    openObject(field.id);
  };

  const removeSelectedNoiseField = () => {
    if (!selectedObjectId || !noiseFields?.some((f) => f.id === selectedObjectId)) return;
    const index = noiseFields.findIndex((f) => f.id === selectedObjectId);
    const next = noiseFields[index + 1] ?? noiseFields[index - 1] ?? null;
    apply((c) => removeNoiseField(c, selectedObjectId));
    if (next) selectObject(next.id);
    else selectLine(lines?.[0]?.id ?? null);
  };

  return (
    <aside className={styles.panel}>
      <h1 className={styles.title}>Objects</h1>
      <div className={styles.body}>
        <Category
          title="Judge lines"
          count={lines?.length ?? 0}
          actions={
            <span className={styles.actions}>
              <button type="button" title="Add line" onClick={addNewLine}>
                +
              </button>
              <button
                type="button"
                title="Delete line"
                disabled={!selectedLineId || !!lineMeta?.[selectedLineId]?.locked}
                onClick={removeSelectedLine}
              >
                −
              </button>
            </span>
          }
        >
          {!!lineGroups?.length && (
            <select
              className={styles.groupFilter}
              value={activeGroupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value="">All groups ({lines?.length ?? 0})</option>
              {lineGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({lines?.filter((l) => l.groupId === g.id).length ?? 0})
                </option>
              ))}
            </select>
          )}
          {!visibleLines?.length && <Empty>No judge line objects</Empty>}
          <ul className={styles.list}>
            {visibleLines?.map((l) => {
              const meta = lineMeta?.[l.id];
              const hidden = !!meta?.hidden;
              const locked = !!meta?.locked;
              return (
                <li
                  key={l.id}
                  className={l.id === selectedLineId ? styles.selected : undefined}
                  onClick={() => openLine(l.id)}
                >
                  <span className={styles.itemLabel}>
                    {meta?.color && (
                      <span className={styles.swatch} style={{ background: meta.color }} />
                    )}
                    <span className={hidden ? styles.dimmed : undefined}>{l.name}</span>
                  </span>
                  <span className={styles.itemRight}>
                    <button
                      type="button"
                      className={`${styles.rowAction} ${hidden ? styles.rowActionActive : ''}`}
                      title={hidden ? 'Show line in preview' : 'Hide line in preview'}
                      onClick={(e) => {
                        e.stopPropagation();
                        apply((c) => patchLineDisplay(c, l.id, { hidden: !hidden }));
                      }}
                    >
                      {hidden ? (
                        <EyeOffIcon width={13} height={13} />
                      ) : (
                        <EyeIcon width={13} height={13} />
                      )}
                    </button>
                    <button
                      type="button"
                      className={`${styles.rowAction} ${locked ? styles.rowActionActive : ''}`}
                      title={locked ? 'Unlock line' : 'Lock line'}
                      onClick={(e) => {
                        e.stopPropagation();
                        apply((c) => patchLineDisplay(c, l.id, { locked: !locked }));
                      }}
                    >
                      {locked ? (
                        <LockIcon width={13} height={13} />
                      ) : (
                        <UnlockIcon width={13} height={13} />
                      )}
                    </button>
                    <span className={styles.count}>{l.notes.length}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Category>

        <Category title="UI elements" count={uiTexts?.length ?? 0}>
          {!uiTexts?.length && <Empty>No UI element objects</Empty>}
          <ul className={styles.list}>
            {uiTexts?.map((t) => (
              <li
                key={t.id}
                className={t.id === selectedObjectId ? styles.selected : undefined}
                onClick={() => openObject(t.id)}
              >
                <span>{t.name}</span>
              </li>
            ))}
          </ul>
        </Category>

        <Category
          title="Text"
          count={texts?.length ?? 0}
          actions={
            <span className={styles.actions}>
              <button type="button" title="Add text" onClick={addNewText}>
                +
              </button>
              <button
                type="button"
                title="Delete text"
                disabled={!texts?.some((t) => t.id === selectedObjectId)}
                onClick={removeSelectedText}
              >
                −
              </button>
            </span>
          }
        >
          {!texts?.length && <Empty>No text objects</Empty>}
          <ul className={styles.list}>
            {texts?.map((t) => (
              <li
                key={t.id}
                className={t.id === selectedObjectId ? styles.selected : undefined}
                onClick={() => openObject(t.id)}
              >
                <span>{t.name}</span>
                <span className={styles.count}>{t.value.length}</span>
              </li>
            ))}
          </ul>
        </Category>

        <Category
          title="Media"
          count={media?.length ?? 0}
          actions={
            <span className={styles.actions}>
              <button type="button" title="Add media" onClick={addNewMedia}>
                +
              </button>
              <button
                type="button"
                title="Delete media"
                disabled={!media?.some((m) => m.id === selectedObjectId)}
                onClick={removeSelectedMedia}
              >
                −
              </button>
            </span>
          }
        >
          {!media?.length && <Empty>No media objects</Empty>}
          <ul className={styles.list}>
            {media?.map((m) => (
              <li
                key={m.id}
                className={m.id === selectedObjectId ? styles.selected : undefined}
                onClick={() => openObject(m.id)}
              >
                <span>{m.name}</span>
                <span className={styles.count}>{m.kind ?? 'empty'}</span>
              </li>
            ))}
          </ul>
        </Category>

        <Category
          title="Shaders"
          count={effects?.length ?? 0}
          actions={
            <span className={styles.actions}>
              <button
                type="button"
                title="Add shader"
                disabled={
                  !!effects && PRESET_NAMES.every((n) => effects.some((e) => e.shader === n))
                }
                onClick={addNewEffect}
              >
                +
              </button>
              <button
                type="button"
                title="Delete shader"
                disabled={!effects?.some((e) => e.id === selectedObjectId)}
                onClick={removeSelectedEffect}
              >
                −
              </button>
            </span>
          }
        >
          {!effects?.length && <Empty>No shader objects</Empty>}
          <ul className={styles.list}>
            {effects?.map((e) => (
              <li
                key={e.id}
                className={e.id === selectedObjectId ? styles.selected : undefined}
                title={e.shader}
                onClick={() => openObject(e.id)}
              >
                <span>{e.name}</span>
                <span className={styles.count}>{e.active.length}</span>
              </li>
            ))}
          </ul>
        </Category>

        <Category
          title="Noise fields"
          count={noiseFields?.length ?? 0}
          actions={
            <span className={styles.actions}>
              <button type="button" title="Add noise field" onClick={addNewNoiseField}>
                +
              </button>
              <button
                type="button"
                title="Delete noise field"
                disabled={!noiseFields?.some((f) => f.id === selectedObjectId)}
                onClick={removeSelectedNoiseField}
              >
                −
              </button>
            </span>
          }
        >
          {!noiseFields?.length && <Empty>No noise field objects</Empty>}
          <ul className={styles.list}>
            {noiseFields?.map((f) => (
              <NoiseRow
                key={f.id}
                field={f}
                selected={f.id === selectedObjectId}
                onOpen={openObject}
              />
            ))}
          </ul>
        </Category>
      </div>
    </aside>
  );
}

// Memoized: charts can have thousands of noise fields.
const NoiseRow = memo(function NoiseRow({
  field,
  selected,
  onOpen,
}: {
  field: NoiseField;
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <li className={selected ? styles.selected : undefined} onClick={() => onOpen(field.id)}>
      <span>{field.name}</span>
      <span className={styles.count}>{field.subtract ? 'subtract' : ''}</span>
    </li>
  );
});

const Empty = ({ children }: { children: ReactNode }) => <p className={styles.muted}>{children}</p>;

function Category({
  title,
  count,
  actions,
  children,
}: {
  title: string;
  count: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <div className={styles.header}>
        <button type="button" className={styles.toggle} onClick={() => setOpen(!open)}>
          <span>{open ? '▾' : '▸'}</span>
          <h2>{title}</h2>
          <span className={styles.count}>{count}</span>
        </button>
        {open && actions}
      </div>
      {open && children}
    </section>
  );
}
