// Live interactive SVG preview for Curve Note Filling.

import { useEffect, useState } from 'react';
import type { CurveFillOptions, SampledCurveNote } from './types';
import { sampleCurvePreviewPath } from './sampler';

interface CurveFillingPreviewProps {
  options: CurveFillOptions;
  sampledNotes: SampledCurveNote[];
}

const TYPE_COLORS: Record<string, string> = {
  drag: '#facc15',
  tap: '#38bdf8',
  flick: '#f43f5e',
  hold: '#a855f7',
};

export function CurveFillingPreview({ options, sampledNotes }: CurveFillingPreviewProps) {
  const [sweepT, setSweepT] = useState(0);

  // Animated playhead sweep
  useEffect(() => {
    let animId: number;
    let startTime = performance.now();
    const loop = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      const period = 2.4; // 2.4s sweep cycle
      setSweepT((elapsed % period) / period);
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const pathPoints = sampleCurvePreviewPath(options, 70);

  // Compute bounding box for auto-scaling
  let minX = -450;
  let maxX = 450;
  for (const pt of pathPoints) {
    if (pt.lineX < minX) minX = pt.lineX;
    if (pt.lineX > maxX) maxX = pt.lineX;
  }
  for (const n of sampledNotes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
  }
  // Padding
  const xSpan = Math.max(300, maxX - minX);
  const padX = xSpan * 0.12;
  const boundMinX = minX - padX;
  const boundMaxX = maxX + padX;

  const startBeat = Math.max(0, options.startBeat);
  const endBeat = Math.max(startBeat + 0.001, options.endBeat);
  const beatSpan = Math.max(0.1, endBeat - startBeat);

  const W = 320;
  const H = 160;
  const P = 14;

  const mapX = (x: number) => {
    return P + ((x - boundMinX) / (boundMaxX - boundMinX)) * (W - P * 2);
  };

  // Time runs from bottom (startBeat) to top (endBeat) like Phigros timeline
  const mapBeat = (b: number) => {
    const norm = (b - startBeat) / beatSpan;
    return H - P - norm * (H - P * 2);
  };

  const zeroX = mapX(0);

  // Path SVG string
  const pathD = pathPoints
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${mapX(pt.lineX).toFixed(1)} ${mapBeat(pt.beat).toFixed(1)}`)
    .join(' ');

  // Sweep line Y
  const sweepBeat = startBeat + sweepT * beatSpan;
  const sweepY = mapBeat(sweepBeat);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        backgroundColor: '#0c0f17',
        border: '1px solid #1e293b',
        borderRadius: '8px',
        padding: '10px',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          color: '#94a3b8',
        }}
      >
        <span style={{ fontWeight: 600, color: '#e2e8f0' }}>
          {sampledNotes.length} {options.noteType.toUpperCase()} notes
        </span>
        <span>
          Beat {startBeat.toFixed(2)} → {endBeat.toFixed(2)}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: '100%',
          height: '140px',
          backgroundColor: '#07090e',
          borderRadius: '6px',
          border: '1px solid #1a2233',
          overflow: 'hidden',
        }}
      >
        <defs>
          <linearGradient id="curveGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="50%" stopColor="rgba(56, 189, 248, 0.7)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>

        {/* Center line (X = 0) */}
        {zeroX >= P && zeroX <= W - P && (
          <line
            x1={zeroX}
            y1={P}
            x2={zeroX}
            y2={H - P}
            stroke="#1e293b"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
        )}

        {/* Start and end beat grid horizontal lines */}
        <line
          x1={P}
          y1={mapBeat(startBeat)}
          x2={W - P}
          y2={mapBeat(startBeat)}
          stroke="#1e293b"
          strokeWidth="1"
        />
        <line
          x1={P}
          y1={mapBeat(endBeat)}
          x2={W - P}
          y2={mapBeat(endBeat)}
          stroke="#1e293b"
          strokeWidth="1"
        />

        {/* Smooth curve trajectory path */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="url(#curveGrad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85"
          />
        )}

        {/* Hold note connection bars */}
        {options.noteType === 'hold' &&
          sampledNotes.map((n, i) => {
            if (!n.holdEndBeat) return null;
            const x = mapX(n.x);
            const y1 = mapBeat(n.beat);
            const y2 = mapBeat(n.holdEndBeat);
            return (
              <line
                key={`hold-${i}`}
                x1={x}
                y1={y1}
                x2={x}
                y2={y2}
                stroke="#c084fc"
                strokeWidth="4"
                strokeLinecap="round"
                opacity="0.6"
              />
            );
          })}

        {/* Sampled note dots */}
        {sampledNotes.map((n, i) => {
          const cx = mapX(n.x);
          const cy = mapBeat(n.beat);
          const color = TYPE_COLORS[n.type] ?? '#38bdf8';
          const isAbove = n.above;

          return (
            <g key={i}>
              {/* Outer halo */}
              <circle cx={cx} cy={cy} r={4.5} fill="#ffffff" opacity="0.4" />
              {/* Core note glyph */}
              <circle cx={cx} cy={cy} r={3} fill={color} />
              {/* Above/below indicator notch */}
              <line
                x1={cx}
                y1={cy + (isAbove ? -4 : 4)}
                x2={cx}
                y2={cy + (isAbove ? -7 : 7)}
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </g>
          );
        })}

        {/* Sweeping playhead line */}
        <line
          x1={P}
          y1={sweepY}
          x2={W - P}
          y2={sweepY}
          stroke="url(#sweepGrad)"
          strokeWidth="2"
        />
      </svg>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '10px',
          color: '#64748b',
          fontFamily: 'monospace',
        }}
      >
        <span>X: {boundMinX.toFixed(0)}</span>
        <span>Center: 0</span>
        <span>X: +{boundMaxX.toFixed(0)}</span>
      </div>
    </div>
  );
}
