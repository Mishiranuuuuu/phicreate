import { useEffect, useMemo, useRef, useState } from 'react';
import type { FittedNotePoint, TextFittingOptions } from './types';
import styles from './TextFittingPanel.module.css';

interface TextFittingPreviewProps {
  points: FittedNotePoint[];
  options: TextFittingOptions;
  viewMode?: 'fit' | 'playfield';
  onToggleViewMode?: () => void;
}

const NOTE_COLORS: Record<string, string> = {
  drag: '#facc15',
  tap: '#38bdf8',
  flick: '#f43f5e',
  hold: '#60a5fa',
};

export function TextFittingPreview({
  points,
  options,
  viewMode = 'playfield',
  onToggleViewMode,
}: TextFittingPreviewProps) {
  const [animProgress, setAnimProgress] = useState(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    let last = performance.now();
    const speed = 0.4; // loop cycles per second
    const frame = (now: number) => {
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      setAnimProgress((p) => {
        const next = (p + dt * speed) % 1;
        return Number.isFinite(next) ? Math.max(0, Math.min(next, 0.999999)) : 0;
      });
      animRef.current = requestAnimationFrame(frame);
    };
    animRef.current = requestAnimationFrame(frame);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const svgData = useMemo(() => {
    const W = 360;
    const H = 220;
    const pad = 20;

    if (!points || points.length === 0) {
      return {
        W,
        H,
        bounds: null,
        originX: W / 2,
        originY: H / 2,
        playfieldFrame: null,
        pointsSVG: [],
      };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const p of points) {
      if (!p) continue;
      if (Number.isFinite(p.x)) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
      }
      if (Number.isFinite(p.y)) {
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
      minX = -100;
      maxX = 100;
    }
    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
      minY = -100;
      maxY = 100;
    }

    let toSvgX: (x: number) => number;
    let toSvgY: (y: number) => number;

    if (viewMode === 'playfield') {
      const scale = Math.min((W - pad * 2) / 1350, (H - pad * 2) / 900);
      const cx = W / 2;
      const cy = H / 2;
      toSvgX = (x) => cx + (Number.isFinite(x) ? x : 0) * scale;
      toSvgY = (y) => cy - (Number.isFinite(y) ? y : 0) * scale;
    } else {
      const boxMinX = Math.min(0, minX);
      const boxMaxX = Math.max(0, maxX);
      const boxMinY = Math.min(0, minY);
      const boxMaxY = Math.max(0, maxY);
      const rangeX = Math.max(boxMaxX - boxMinX, 100);
      const rangeY = Math.max(boxMaxY - boxMinY, 80);
      const scale = Math.min((W - pad * 2) / rangeX, (H - pad * 2) / rangeY);
      const midX = (boxMinX + boxMaxX) / 2;
      const midY = (boxMinY + boxMaxY) / 2;
      const cx = W / 2;
      const cy = H / 2;
      toSvgX = (x) => cx + ((Number.isFinite(x) ? x : 0) - midX) * scale;
      toSvgY = (y) => cy - ((Number.isFinite(y) ? y : 0) - midY) * scale;
    }

    const pointsSVG = points
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p, idx) => ({
        x: toSvgX(p.x),
        y: toSvgY(p.y),
        origX: p.x,
        origY: p.y,
        beat: p.beat,
        order: idx,
      }));

    return {
      W,
      H,
      bounds: { minX, maxX, minY, maxY },
      originX: toSvgX(0),
      originY: toSvgY(0),
      playfieldFrame:
        viewMode === 'playfield'
          ? {
              x: toSvgX(-675),
              y: toSvgY(450),
              w: toSvgX(675) - toSvgX(-675),
              h: toSvgY(-450) - toSvgY(450),
            }
          : null,
      pointsSVG,
    };
  }, [points, viewMode]);

  const noteColor = NOTE_COLORS[options.noteType] ?? '#facc15';
  const totalNotes = svgData.pointsSVG.length;
  const activeCount = Math.floor(animProgress * totalNotes);

  return (
    <div className={styles.previewContainer}>
      <div className={styles.previewHeader}>
        <span className={styles.previewBadge}>
          {points.length} {options.noteType} notes
        </span>
        {onToggleViewMode && (
          <button
            type="button"
            className={styles.viewModeToggle}
            onClick={onToggleViewMode}
            title={viewMode === 'fit' ? 'Switch to playfield view' : 'Switch to auto-fit view'}
          >
            {viewMode === 'playfield' ? 'Playfield' : 'Fit'}
          </button>
        )}
      </div>

      <svg
        className={styles.previewSvg}
        viewBox={`0 0 ${svgData.W} ${svgData.H}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Playfield border */}
        {svgData.playfieldFrame && (
          <rect
            x={svgData.playfieldFrame.x}
            y={svgData.playfieldFrame.y}
            width={svgData.playfieldFrame.w}
            height={svgData.playfieldFrame.h}
            fill="none"
            stroke="var(--c-border)"
            strokeDasharray="4 4"
            strokeWidth={1}
            rx={4}
          />
        )}

        {/* Center axes */}
        <line
          x1={0}
          y1={svgData.originY}
          x2={svgData.W}
          y2={svgData.originY}
          stroke="var(--c-border)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
        <line
          x1={svgData.originX}
          y1={0}
          x2={svgData.originX}
          y2={svgData.H}
          stroke="var(--c-border)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />

        {/* Render note dots */}
        {svgData.pointsSVG.map((p) => {
          const isFired =
            options.timingMode === 'simultaneous' || p.order <= activeCount;
          const r = Math.max(2, Math.min(5, 3.2 * (options.noteSize || 1)));

          return (
            <g key={p.order}>
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={noteColor}
                opacity={isFired ? 1 : 0.25}
              />
              {isFired && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r + 1.5}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={0.8}
                  opacity={0.7}
                />
              )}
            </g>
          );
        })}
      </svg>

      {svgData.bounds && (
        <div className={styles.previewFooter}>
          <span>
            X: [{Math.round(svgData.bounds.minX)}, {Math.round(svgData.bounds.maxX)}]
          </span>
          <span>
            Y: [{Math.round(svgData.bounds.minY)}, {Math.round(svgData.bounds.maxY)}]
          </span>
        </div>
      )}
    </div>
  );
}
