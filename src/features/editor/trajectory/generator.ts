import { createId } from '@/lib/id';
import { fromFloat, toFloat } from '@/features/chart/model/beat';
import type { EventItem, NumEvent } from '@/features/chart/model/types';
import { addEvents, removeEvents } from '@/features/chart/runtime/commands';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import { sampleTrajectory } from './sampler';
import type { TrajectoryOptions, TrajectoryPoint } from './types';

export function createTrajectoryEvents(
  points: TrajectoryPoint[],
  options: TrajectoryOptions,
): EventItem[] {
  const segCount = points.length - 1;
  if (segCount < 1) return [];

  const startBeat = options.startBeat;
  const endBeat = options.endBeat;
  const beatRange = endBeat - startBeat;
  const items: EventItem[] = [];

  for (let i = 0; i < segCount; i++) {
    const b0 = startBeat + (beatRange * i) / segCount;
    const b1 = startBeat + (beatRange * (i + 1)) / segCount;

    const start = fromFloat(b0, 960);
    const end = fromFloat(b1, 960);

    const xEvent: NumEvent = {
      id: createId(),
      start,
      end,
      from: points[i].x,
      to: points[i + 1].x,
      easing: { kind: 'preset', id: 1 },
    };

    const yEvent: NumEvent = {
      id: createId(),
      start,
      end,
      from: points[i].y,
      to: points[i + 1].y,
      easing: { kind: 'preset', id: 1 },
    };

    items.push({ channel: 'moveX', event: xEvent });
    items.push({ channel: 'moveY', event: yEvent });

    if (options.autoTangent) {
      const rotEvent: NumEvent = {
        id: createId(),
        start,
        end,
        from: points[i].angle,
        to: points[i + 1].angle,
        easing: { kind: 'preset', id: 1 },
      };
      items.push({ channel: 'rotate', event: rotEvent });
    }
  }

  return items;
}

export function commitTrajectory(
  options: TrajectoryOptions,
  replaceExisting = false,
): { success: boolean; eventCount: number; message?: string } {
  const chart = useChartStore.getState().chart;
  if (!chart) return { success: false, eventCount: 0, message: 'No chart loaded' };

  const lineId = options.targetLineId;
  if (!lineId) return { success: false, eventCount: 0, message: 'No judgement line selected' };

  const line = chart.lines.find((l) => l.id === lineId);
  if (!line) return { success: false, eventCount: 0, message: 'Target line not found' };

  const layerId = options.targetLayerId ?? line.layers[0]?.id;
  if (!layerId) return { success: false, eventCount: 0, message: 'No layer available on target line' };

  const points = sampleTrajectory(options);
  if (points.length < 2) {
    return { success: false, eventCount: 0, message: 'Trajectory sampling produced too few points' };
  }

  const items = createTrajectoryEvents(points, options);
  if (items.length === 0) {
    return { success: false, eventCount: 0, message: 'No events generated' };
  }

  useChartStore.getState().apply((currentChart) => {
    let nextChart = currentChart;

    if (replaceExisting) {
      const targetLine = nextChart.lines.find((l) => l.id === lineId);
      const targetLayer = targetLine?.layers.find((ly) => ly.id === layerId);
      if (targetLayer) {
        const channelsToClear: ('moveX' | 'moveY' | 'rotate')[] = ['moveX', 'moveY'];
        if (options.autoTangent) channelsToClear.push('rotate');

        const idsToRemove: string[] = [];
        for (const ch of channelsToClear) {
          const events = targetLayer[ch];
          for (const ev of events) {
            const evStart = toFloat(ev.start);
            const evEnd = toFloat(ev.end);
            if (evStart < options.endBeat && evEnd > options.startBeat) {
              idsToRemove.push(ev.id);
            }
          }
        }
        if (idsToRemove.length > 0) {
          nextChart = removeEvents(nextChart, lineId, layerId, idsToRemove);
        }
      }
    }

    return addEvents(nextChart, lineId, layerId, items);
  });

  return { success: true, eventCount: items.length };
}
