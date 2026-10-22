import { cmp, format, fromFloat, parse, toFloat } from '@/features/chart/model/beat';
import {
  addLineGroup,
  addTimeTag,
  bpmAt,
  moveBpmPoint,
  patchTimeTag,
  removeBpmPoint,
  removeLineGroup,
  removeTimeTag,
  renameLineGroup,
  setBpmPoint,
  setOffset,
} from '@/features/chart/runtime/commands';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import { parseNumber } from '@/lib/number';
import { CommitInput } from '../CommitInput';
import { beatToMusicTime, musicTimeToBeat } from '../time';
import { useEditorStore } from '../useEditorStore';
import { Row } from './fields';
import styles from './SidePanel.module.css';

export function TimingPanel() {
  const bpmList = useChartStore((s) => s.chart?.bpmList);
  const timeTags = useChartStore((s) => s.chart?.timeTags);
  const offsetMs = useChartStore((s) => s.chart?.offsetMs ?? 0);
  const apply = useChartStore((s) => s.apply);
  const points = [...(bpmList ?? [])].sort((a, b) => cmp(a.beat, b.beat));
  const tags = [...(timeTags ?? [])].sort((a, b) => cmp(a.beat, b.beat));

  // Adds a change at the playhead, starting from the current BPM.
  const addAtPlayhead = () => {
    const { chart } = useChartStore.getState();
    const { time, division } = useEditorStore.getState();
    if (!chart) return;
    const beat = fromFloat(Math.max(0, musicTimeToBeat(chart, time)), division);
    apply((c) => setBpmPoint(c, beat, bpmAt(c, beat)));
  };

  const addTagAtPlayhead = () => {
    const { chart } = useChartStore.getState();
    const { time, division } = useEditorStore.getState();
    if (!chart) return;
    const beat = fromFloat(Math.max(0, musicTimeToBeat(chart, time)), division);
    apply((c) => addTimeTag(c, beat));
  };

  const jumpToBeat = (beatF: number) => {
    const { chart } = useChartStore.getState();
    if (!chart) return;
    const editor = useEditorStore.getState();
    if (editor.playing) editor.pause();
    editor.seek(beatToMusicTime(chart, beatF));
  };

  return (
    <>
      <div className={styles.props}>
        <Row label="Offset (ms)">
          <CommitInput
            value={String(offsetMs)}
            inputMode="numeric"
            onCommit={(text) => {
              const v = parseNumber(text);
              if (v === null) return false;
              apply((c) => setOffset(c, Math.round(v)));
            }}
          />
        </Row>
      </div>
      <div className={`${styles.header} ${styles.subheader}`}>
        <h2>BPM changes</h2>
        <span className={styles.actions}>
          <button type="button" title="Add change at playhead" onClick={addAtPlayhead}>
            +
          </button>
        </span>
      </div>
      <ul className={styles.bpmList}>
        {points.map((p, i) => (
          <li key={i === 0 ? 'base' : format(p.beat)}>
            {i === 0 ? (
              <span className={styles.bpmBeat}>{format(p.beat)}</span>
            ) : (
              <CommitInput
                className={styles.bpmBeat}
                value={format(p.beat)}
                onCommit={(text) => {
                  const beat = parse(text);
                  if (!beat || cmp(beat, [0, 0, 1]) <= 0) return false;
                  const before = useChartStore.getState().chart;
                  apply((c) => moveBpmPoint(c, p.beat, beat));
                  if (useChartStore.getState().chart === before) return false;
                }}
              />
            )}
            <CommitInput
              value={String(p.bpm)}
              inputMode="decimal"
              onCommit={(text) => {
                const v = parseNumber(text);
                if (!v || v <= 0) return false;
                apply((c) => setBpmPoint(c, p.beat, v));
              }}
            />
            {i > 0 ? (
              <button
                type="button"
                className={styles.inlineAction}
                title="Delete change"
                onClick={() => apply((c) => removeBpmPoint(c, p.beat))}
              >
                ×
              </button>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>

      <div className={`${styles.header} ${styles.subheader}`}>
        <h2>Time tags</h2>
        <span className={styles.actions}>
          <button type="button" title="Add bookmark at playhead" onClick={addTagAtPlayhead}>
            +
          </button>
        </span>
      </div>
      {!tags.length ? (
        <p className={styles.muted}>No time tags.</p>
      ) : (
        <ul className={styles.tagList}>
          {tags.map((t) => (
            <li key={t.id}>
              <CommitInput
                className={styles.bpmBeat}
                value={format(t.beat)}
                title="Beat"
                onCommit={(text) => {
                  const beat = parse(text);
                  if (!beat || cmp(beat, [0, 0, 1]) < 0) return false;
                  apply((c) => patchTimeTag(c, t.id, { beat }));
                }}
              />
              <CommitInput
                value={t.name}
                title="Tag name"
                onCommit={(name) => {
                  if (!name.trim()) return false;
                  apply((c) => patchTimeTag(c, t.id, { name: name.trim() }));
                }}
              />
              <button
                type="button"
                className={styles.inlineAction}
                title="Jump to tag"
                onClick={() => jumpToBeat(toFloat(t.beat))}
              >
                →
              </button>
              <button
                type="button"
                className={styles.inlineAction}
                title="Delete tag"
                onClick={() => apply((c) => removeTimeTag(c, t.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function LineGroupsPanel() {
  const groups = useChartStore((s) => s.chart?.lineGroups ?? []);
  const lines = useChartStore((s) => s.chart?.lines ?? []);
  const apply = useChartStore((s) => s.apply);

  return (
    <>
      <div className={styles.header}>
        <h2>Line groups</h2>
        <span className={styles.actions}>
          <button
            type="button"
            title="Add line group"
            onClick={() => apply((c) => addLineGroup(c))}
          >
            +
          </button>
        </span>
      </div>
      {!groups.length ? (
        <p className={styles.muted}>No line groups.</p>
      ) : (
        <ul className={styles.groupList}>
          {groups.map((g) => {
            const count = lines.filter((l) => l.groupId === g.id).length;
            return (
              <li key={g.id}>
                <CommitInput
                  value={g.name}
                  onCommit={(name) => {
                    if (!name.trim()) return false;
                    apply((c) => renameLineGroup(c, g.id, name.trim()));
                  }}
                />
                <span className={styles.count} title="Lines in group">
                  {count}
                </span>
                <button
                  type="button"
                  className={styles.inlineAction}
                  title="Delete group"
                  onClick={() => apply((c) => removeLineGroup(c, g.id))}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
