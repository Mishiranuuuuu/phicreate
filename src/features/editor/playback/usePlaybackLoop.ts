import { useEffect } from 'react';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import type { Settings } from '@/features/settings/types';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { useEditorStore } from '../useEditorStore';
import { getHits, toChartTime, type Hit } from '../time';
import { playback } from './playback';
import { playHitsound, setHitsoundVolume, soundFor } from './hitsound';

// Larger jumps are seeks, not playback.
const MAX_FRAME_STEP = 0.25;
const MAX_SOUNDS_PER_FRAME = 16;

function firstAfter(hits: Hit[], t: number) {
  let lo = 0;
  let hi = hits.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (hits[mid].time <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Syncs the store's playhead with the music clock and fires hitsounds.
export function usePlaybackLoop() {
  useEffect(() => {
    const applyVolumes = ({ musicVolume, hitsoundVolume }: Settings) => {
      playback.setVolume(musicVolume);
      setHitsoundVolume(hitsoundVolume);
    };
    applyVolumes(useSettingsStore.getState().settings);
    return useSettingsStore.subscribe((s) => applyVolumes(s.settings));
  }, []);

  useEffect(() => {
    playback.onEnded = () => useEditorStore.getState().pause();
    playback.onDuration = (duration) => useEditorStore.getState().set({ duration });

    let raf = 0;
    let prev = -1;
    const tick = () => {
      const editor = useEditorStore.getState();
      if (editor.playing) {
        const t = playback.time;
        editor.set({ time: t });
        const chart = useChartStore.getState().chart;
        if (
          chart &&
          useSettingsStore.getState().settings.hitsoundVolume > 0 &&
          prev >= 0 &&
          t > prev &&
          t - prev < MAX_FRAME_STEP
        ) {
          const hits = getHits(chart);
          const until = toChartTime(chart, t);
          let played = 0;
          for (let i = firstAfter(hits, toChartTime(chart, prev)); i < hits.length; i++) {
            if (hits[i].time > until || played++ >= MAX_SOUNDS_PER_FRAME) break;
            playHitsound(soundFor(hits[i].type));
          }
        }
        prev = t;
      } else {
        prev = -1;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      playback.onEnded = null;
      playback.onDuration = null;
    };
  }, []);
}
