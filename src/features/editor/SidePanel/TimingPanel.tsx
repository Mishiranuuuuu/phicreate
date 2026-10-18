import { cmp, format, fromFloat, parse } from '@/features/chart/model/beat';
import {
  bpmAt,
  moveBpmPoint,
  removeBpmPoint,
  setBpmPoint,
  setOffset,
} from '@/features/chart/runtime/commands';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import { parseNumber } from '@/lib/number';
import { CommitInput } from '../CommitInput';
import { musicTimeToBeat } from '../time';
import { useEditorStore } from '../useEditorStore';
import { Row } from './fields';
import styles from './SidePanel.module.css';

export function TimingPanel() {
  const bpmList = useChartStore((s) => s.chart?.bpmList);
  const offsetMs = useChartStore((s) => s.chart?.offsetMs ?? 0);
  const apply = useChartStore((s) => s.apply);
  const points = [...(bpmList ?? [])].sort((a, b) => cmp(a.beat, b.beat));

  // Adds a change at the playhead, starting from the current BPM.
  const addAtPlayhead = () => {
    const { chart } = useChartStore.getState();
    const { time, division } = useEditorStore.getState();
    if (!chart) return;
    const beat = fromFloat(Math.max(0, musicTimeToBeat(chart, time)), division);
    apply((c) => setBpmPoint(c, beat, bpmAt(c, beat)));
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
    </>
  );
}
