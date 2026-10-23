import { useEffect, useMemo, useRef, useState } from 'react';
import type { TrajectoryPoint } from './types';
import styles from './TrajectoryPanel.module.css';

interface TrajectoryPreviewProps {
  points: TrajectoryPoint[];
  autoTangent: boolean;
  viewMode?: 'fit' | 'playfield';
  onToggleViewMode?: () => void;
}

export function TrajectoryPreview({
  points,
  autoTangent,
  viewMode = 'playfield',
  onToggleViewMode,
}: TrajectoryPreviewProps) {
  const [animProgress, setAnimProgress] = useState(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    let last = performance.now();
    const speed = 0.35; // loop cycles per second
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
    const H = 240;
    const pad = 24;

    if (!points || points.length < 2) {
      return {
        path: '',
        W,
        H,
        bounds: null,
        originX: W / 2,
        originY: H / 2,
        playfieldFrame: null,
        currentPt: null,
        currentAngle: 0,
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
      // 1350 x 900 playfield centered
      const scale = Math.min((W - pad * 2) / 1350, (H - pad * 2) / 900);
      const cx = W / 2;
      const cy = H / 2;
      toSvgX = (x) => cx + (Number.isFinite(x) ? x : 0) * scale;
      toSvgY = (y) => cy - (Number.isFinite(y) ? y : 0) * scale;
    } else {
      // Auto-fit to curve bounding box while keeping (0, 0) in view
      const boxMinX = Math.min(0, minX);
      const boxMaxX = Math.max(0, maxX);
      const boxMinY = Math.min(0, minY);
      const boxMaxY = Math.max(0, maxY);
      const rangeX = Math.max(boxMaxX - boxMinX, 100);
      const rangeY = Math.max(boxMaxY - boxMinY, 100);
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
      .map((p) => ({
        x: toSvgX(p.x),
        y: toSvgY(p.y),
        origX: p.x,
        origY: p.y,
        angle: Number.isFinite(p.angle) ? p.angle : 0,
      }));

    if (pointsSVG.length < 2) {
      return {
        path: '',
        W,
        H,
        bounds: null,
        originX: toSvgX(0),
        originY: toSvgY(0),
        playfieldFrame: null,
        currentPt: null,
        currentAngle: 0,
        pointsSVG,
      };
    }

    // SVG path string
    let path = `M ${pointsSVG[0].x.toFixed(1)} ${pointsSVG[0].y.toFixed(1)}`;
    for (let i = 1; i < pointsSVG.length; i++) {
      path += ` L ${pointsSVG[i].x.toFixed(1)} ${pointsSVG[i].y.toFixed(1)}`;
    }

    // Current moving point & angle along segments
    const totalSegs = Math.max(1, pointsSVG.length - 1);
    const progress = Math.max(0, Math.min(0.999999, Number.isFinite(animProgress) ? animProgress : 0));
    const segFloat = progress * totalSegs;
    const segIdx = Math.max(0, Math.min(Math.floor(segFloat), pointsSVG.length - 1));
    const segT = Math.max(0, Math.min(1, segFloat - segIdx));

    const pA = pointsSVG[segIdx] ?? pointsSVG[0];
    const pB = pointsSVG[Math.min(segIdx + 1, pointsSVG.length - 1)] ?? pA;

    const currX = pA ? pA.x + (pB.x - pA.x) * segT : W / 2;
    const currY = pA ? pA.y + (pB.y - pA.y) * segT : H / 2;
    const currAngle = pA ? pA.angle + (pB.angle - pA.angle) * segT : 0;

    return {
      path,
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
      currentPt: { x: currX, y: currY },
      currentAngle: currAngle,
      pointsSVG,
    };
  }, [points, animProgress, viewMode]);

  return (
    <div className={styles.previewContainer}>
      <div className={styles.previewHeader}>
        <span className={styles.previewBadge}>
          {points.length} pts ({points.length > 1 ? points.length - 1 : 0} segs)
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
        <defs>
          <linearGradient id="trajGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--c-accent)" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>

        {/* Playfield border outline in playfield view */}
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

        {/* Center axes passing through (0, 0) */}
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

        {/* Curve path */}
        {svgData.path && (
          <path
            d={svgData.path}
            fill="none"
            stroke="url(#trajGrad)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Subtle segment dots */}
        {svgData.pointsSVG.length <= 64 &&
          svgData.pointsSVG.map((p, idx) => (
            <circle
              key={idx}
              cx={p.x}
              cy={p.y}
              r={1.5}
              fill="var(--c-text-muted)"
              opacity={0.6}
            />
          ))}

        {/* Start point marker */}
        {svgData.pointsSVG.length > 0 && (
          <g>
            <circle
              cx={svgData.pointsSVG[0].x}
              cy={svgData.pointsSVG[0].y}
              r={4.5}
              fill="#10b981"
            />
            <text
              x={svgData.pointsSVG[0].x + 6}
              y={svgData.pointsSVG[0].y + 3}
              fill="#10b981"
              fontSize={10}
              fontWeight="bold"
            >
              S
            </text>
          </g>
        )}

        {/* End point marker */}
        {svgData.pointsSVG.length > 1 && (
          <g>
            <circle
              cx={svgData.pointsSVG[svgData.pointsSVG.length - 1].x}
              cy={svgData.pointsSVG[svgData.pointsSVG.length - 1].y}
              r={4.5}
              fill="#f43f5e"
            />
            <text
              x={svgData.pointsSVG[svgData.pointsSVG.length - 1].x + 6}
              y={svgData.pointsSVG[svgData.pointsSVG.length - 1].y + 3}
              fill="#f43f5e"
              fontSize={10}
              fontWeight="bold"
            >
              E
            </text>
          </g>
        )}

        {/* Moving dot + tangent pointer */}
        {svgData.currentPt && (
          <g transform={`translate(${svgData.currentPt.x}, ${svgData.currentPt.y})`}>
            <circle r={5} fill="var(--c-accent)" stroke="#ffffff" strokeWidth={1.5} />
            {autoTangent && (
              <g transform={`rotate(${svgData.currentAngle})`}>
                <line x1={0} y1={0} x2={16} y2={0} stroke="#ffffff" strokeWidth={2} />
                <polygon points="16,-3 22,0 16,3" fill="#ffffff" />
              </g>
            )}
          </g>
        )}
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
