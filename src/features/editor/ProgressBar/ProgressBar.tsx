import { format, toFloat } from '@/features/chart/model/beat';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import { useEditorStore } from '../useEditorStore';
import { beatToMusicTime, chartEndTime, formatTime, musicTimeToBeat } from '../time';
import styles from './ProgressBar.module.css';

// Fallback length when the project has no audio.
const MIN_SILENT_DURATION = 60;

export function ProgressBar() {
  const time = useEditorStore((s) => s.time);
  const audioDuration = useEditorStore((s) => s.duration);
  const seek = useEditorStore((s) => s.seek);
  const pause = useEditorStore((s) => s.pause);
  const chart = useChartStore((s) => s.chart);
  const beat = chart ? musicTimeToBeat(chart, time) : 0;
  const duration =
    audioDuration || Math.max(MIN_SILENT_DURATION, (chart ? chartEndTime(chart) : 0) + 5);

  return (
    <div className={styles.progress}>
      <div className={styles.readout}>
        <span>Beat {Math.max(0, beat).toFixed(2)}</span>
        <span>
          {formatTime(time)} / {formatTime(duration)}
        </span>
      </div>
      {!!chart?.timeTags.length && (
        <div className={styles.tagStrip}>
          {chart.timeTags.map((tag) => {
            const tagTime = beatToMusicTime(chart, toFloat(tag.beat));
            if (tagTime < 0 || tagTime > duration || duration <= 0) return null;
            return (
              <button
                key={tag.id}
                type="button"
                className={styles.tagPin}
                style={{ left: `${(tagTime / duration) * 100}%` }}
                title={`${tag.name} — Beat ${format(tag.beat)} (Ctrl+↑/↓)`}
                onClick={() => {
                  if (useEditorStore.getState().playing) pause();
                  seek(tagTime);
                }}
              >
                <span className={styles.tagMarker} />
              </button>
            );
          })}
        </div>
      )}
      <input
        type="range"
        className={styles.seek}
        min={0}
        max={duration}
        step={0.001}
        value={Math.min(time, duration)}
        onChange={(e) => {
          // Scrubbing takes over the playhead.
          if (useEditorStore.getState().playing) pause();
          seek(Number(e.target.value));
        }}
      />
    </div>
  );
}
