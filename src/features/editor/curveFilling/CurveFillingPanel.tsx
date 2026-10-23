// UI Panel for Curve Note Filling (填充曲线音符).

import { useEffect, useMemo, useState } from 'react';
import { toFloat } from '@/features/chart/model/beat';
import { secondsToBeat, beatToSeconds } from '@/features/chart/model/timing';
import { NOTE_TYPES, type NoteType } from '@/features/chart/model/types';
import { lineRuntime } from '@/features/chart/runtime/scene';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import { EasingSelect } from '../SidePanel/EasingSelect';
import { Check, Row, Section } from '../SidePanel/fields';
import { useEditorStore } from '../useEditorStore';
import { CurveFillingPreview } from './CurveFillingPreview';
import { commitCurveNotes } from './generator';
import { MATH_PRESETS } from './presets';
import { sampleCurveNotes, sampleCurvePreviewPath } from './sampler';
import type { CurveFillOptions, CurveFillSide, WaveType, WaveEnvelope } from './types';
import styles from './CurveFillingPanel.module.css';

const SNAP_DIVISIONS = [4, 8, 12, 16, 24, 32, 48, 64];

function NumInput({
  value,
  step = 1,
  min,
  max,
  onChange,
  ariaLabel,
}: {
  value: number;
  step?: number | string;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
  ariaLabel?: string;
}) {
  return (
    <input
      type="number"
      className={styles.inputNumber}
      value={Number.isFinite(value) ? value : 0}
      step={step}
      min={min}
      max={max}
      aria-label={ariaLabel}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

export function CurveFillingPanel() {
  const chart = useChartStore((s) => s.chart);
  const selectedLineId = useEditorStore((s) => s.selectedLineId);
  const selectedNoteIds = useEditorStore((s) => s.selectedNoteIds);
  const currentTime = useEditorStore((s) => s.time);

  // Default target line is the selected line or the first line
  const targetLine = useMemo(() => {
    if (!chart?.lines.length) return null;
    return chart.lines.find((l) => l.id === selectedLineId) ?? chart.lines[0];
  }, [chart, selectedLineId]);

  // Current beat in chart
  const currentBeat = useMemo(() => {
    if (!chart) return 0;
    return Math.max(0, Math.round(secondsToBeat(chart.bpmList, currentTime) * 4) / 4);
  }, [chart, currentTime]);

  const [options, setOptions] = useState<CurveFillOptions>(() => ({
    mode: 'endpoints',
    targetLineId: targetLine?.id ?? null,
    startBeat: currentBeat,
    endBeat: currentBeat + 4,
    startX: -300,
    endX: 300,
    easingId: 1, // Linear
    isBezier: false,
    bezierPoints: [0.25, 0.1, 0.25, 1],
    waveType: 'none',
    waveAmp: 120,
    waveCycles: 2,
    wavePhase: 0,
    waveEnvelope: 'pinned',
    mathPresetId: 'sine',
    mathCenterX: 0,
    mathAmp: 250,
    mathCycles: 2,
    mathPhase: 0,
    customExpr: '250 * sin(2 * pi * t)',
    densityMode: 'snap',
    snapDivision: 16,
    totalCount: 32,
    includeStart: true,
    includeEnd: true,
    noteType: 'drag',
    holdDuration: 0.5,
    side: 'above',
    fake: false,
    speed: 1,
    alpha: 255,
    size: 1,
  }));

  // Update targetLineId if active line changes and none set
  useEffect(() => {
    if (targetLine && !options.targetLineId) {
      setOptions((prev) => ({ ...prev, targetLineId: targetLine.id }));
    }
  }, [targetLine, options.targetLineId]);

  const [notification, setNotification] = useState<string | null>(null);

  // Sample notes according to current options
  const sampledNotes = useMemo(() => {
    return sampleCurveNotes(options);
  }, [options]);

  // Update canvas ghost overlay
  useEffect(() => {
    if (!chart || !targetLine) {
      useEditorStore.getState().set({ curveFillGhost: null });
      return;
    }

    try {
      const lineNotes: {
        x: number;
        y: number;
        beat: number;
        lineX: number;
        type: NoteType;
        above: boolean;
      }[] = [];

      for (const n of sampledNotes) {
        const time = beatToSeconds(chart.bpmList, n.beat);
        const state = lineRuntime(targetLine, chart.bpmList).localState(time);
        const rad = (state.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Note hit position in playfield coordinates
        const nx = state.x + n.x * cos;
        const ny = state.y + n.x * sin;

        lineNotes.push({
          x: nx,
          y: ny,
          beat: n.beat,
          lineX: n.x,
          type: n.type,
          above: n.above,
        });
      }

      // Sample smooth curve path points
      const previewPath = sampleCurvePreviewPath(options, 60);
      const pathPoints = previewPath.map((p) => {
        const time = beatToSeconds(chart.bpmList, p.beat);
        const state = lineRuntime(targetLine, chart.bpmList).localState(time);
        const rad = (state.rotation * Math.PI) / 180;
        return {
          x: state.x + p.lineX * Math.cos(rad),
          y: state.y + p.lineX * Math.sin(rad),
        };
      });

      useEditorStore.getState().set({
        curveFillGhost: {
          targetLineId: targetLine.id,
          notes: lineNotes,
          pathPoints,
        },
      });
    } catch (err) {
      console.warn('Error generating curveFillGhost:', err);
    }

    return () => {
      useEditorStore.getState().set({ curveFillGhost: null });
    };
  }, [chart, targetLine, sampledNotes, options]);

  // Populate from selected note(s) in editor
  const handleUseSelection = () => {
    if (!chart || !targetLine || !selectedNoteIds.length) return;
    const selectedNotes = targetLine.notes
      .filter((n) => selectedNoteIds.includes(n.id))
      .sort((a, b) => toFloat(a.beat) - toFloat(b.beat));

    if (selectedNotes.length >= 2) {
      const n1 = selectedNotes[0];
      const n2 = selectedNotes[selectedNotes.length - 1];
      setOptions((prev) => ({
        ...prev,
        startBeat: Math.round(toFloat(n1.beat) * 100) / 100,
        startX: n1.x,
        endBeat: Math.round(toFloat(n2.beat) * 100) / 100,
        endX: n2.x,
        includeStart: false, // Don't duplicate already placed endpoints
        includeEnd: false,
        noteType: n1.type,
      }));
      setNotification(`Imported endpoints from 2 selected notes (Beat ${toFloat(n1.beat).toFixed(2)} → ${toFloat(n2.beat).toFixed(2)})`);
    } else if (selectedNotes.length === 1) {
      const n = selectedNotes[0];
      const b = Math.round(toFloat(n.beat) * 100) / 100;
      setOptions((prev) => ({
        ...prev,
        startBeat: b,
        startX: n.x,
        endBeat: b + 2,
        endX: n.x + 200,
        includeStart: false,
        noteType: n.type,
      }));
      setNotification(`Imported start point from selected note at Beat ${b.toFixed(2)}`);
    }
  };

  const handleGenerate = () => {
    if (!sampledNotes.length) return;
    const count = commitCurveNotes(options, sampledNotes);
    const lineName = targetLine ? `Line #${chart?.lines.indexOf(targetLine) ?? 0}` : 'line';
    setNotification(`Successfully generated ${count} ${options.noteType.toUpperCase()} notes on ${lineName}!`);
  };

  const updateOpt = <K extends keyof CurveFillOptions>(key: K, val: CurveFillOptions[K]) => {
    setOptions((prev) => ({ ...prev, [key]: val }));
  };

  return (
    <div className={styles.panel}>
      <p className={styles.intro}>
        Generate smooth curve streams, stairs, and mathematical note trajectories (Drags, Taps, Flicks, Holds) along judge lines.
      </p>

      {/* Mode Switch: Endpoints vs Math Presets */}
      <div className={styles.segmented}>
        <button
          type="button"
          className={`${styles.segmentBtn} ${options.mode === 'endpoints' ? styles.segmentBtnActive : ''}`}
          onClick={() => updateOpt('mode', 'endpoints')}
        >
          Between Points (Easing)
        </button>
        <button
          type="button"
          className={`${styles.segmentBtn} ${options.mode === 'math' ? styles.segmentBtnActive : ''}`}
          onClick={() => updateOpt('mode', 'math')}
        >
          Math Presets & Waves
        </button>
      </div>

      {/* Mode A: Endpoints & Easing Controls */}
      {options.mode === 'endpoints' && (
        <Section
          title="Endpoints (Start → End)"
          actions={
            selectedNoteIds.length > 0 && (
              <button type="button" className={styles.actionBtn} onClick={handleUseSelection}>
                From Selection ({selectedNoteIds.length})
              </button>
            )
          }
        >
          {/* Start Beat & Start X */}
          <Row label="Start Point" onScrub={(d) => updateOpt('startX', options.startX + Math.round(d))} scrubStep={2}>
            <div className={styles.rowInputs}>
              <NumInput
                step="0.25"
                min={0}
                value={options.startBeat}
                onChange={(v) => updateOpt('startBeat', Math.max(0, v))}
                ariaLabel="Start beat"
              />
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => updateOpt('startBeat', currentBeat)}
                title="Set to current playhead beat"
              >
                Now
              </button>
              <NumInput
                step="5"
                value={options.startX}
                onChange={(v) => updateOpt('startX', v)}
                ariaLabel="Start X"
              />
            </div>
          </Row>

          {/* End Beat & End X */}
          <Row label="End Point" onScrub={(d) => updateOpt('endX', options.endX + Math.round(d))} scrubStep={2}>
            <div className={styles.rowInputs}>
              <NumInput
                step="0.25"
                min={0}
                value={options.endBeat}
                onChange={(v) => updateOpt('endBeat', Math.max(0, v))}
                ariaLabel="End beat"
              />
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => updateOpt('endBeat', currentBeat)}
                title="Set to current playhead beat"
              >
                Now
              </button>
              <NumInput
                step="5"
                value={options.endX}
                onChange={(v) => updateOpt('endX', v)}
                ariaLabel="End X"
              />
            </div>
          </Row>

          {/* Quick X alignments */}
          <div className={styles.pillGroup} style={{ marginTop: '2px' }}>
            <span style={{ fontSize: '10.5px', color: '#64748b', alignSelf: 'center' }}>Quick X:</span>
            <button
              type="button"
              className={styles.pill}
              onClick={() => {
                updateOpt('startX', -350);
                updateOpt('endX', 350);
              }}
            >
              Left → Right (-350 → +350)
            </button>
            <button
              type="button"
              className={styles.pill}
              onClick={() => {
                updateOpt('startX', 350);
                updateOpt('endX', -350);
              }}
            >
              Right → Left
            </button>
            <button
              type="button"
              className={styles.pill}
              onClick={() => {
                updateOpt('startX', 0);
                updateOpt('endX', 0);
              }}
            >
              Center (0 → 0)
            </button>
          </div>

          {/* Easing Curve */}
          <Row label="Easing">
            <EasingSelect
              value={options.isBezier ? undefined : options.easingId}
              onChange={(id) => {
                setOptions((prev) => ({ ...prev, easingId: id, isBezier: false }));
              }}
            />
          </Row>

          {/* Wave Modulation Sub-Section */}
          <Section title="Wave Modulation (Serpentine / Stair)">
            <Row label="Wave Type">
              <div className={styles.pillGroup}>
                {(['none', 'sine', 'cosine', 'triangle'] as WaveType[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={`${styles.pill} ${options.waveType === w ? styles.pillActive : ''}`}
                    onClick={() => updateOpt('waveType', w)}
                  >
                    {w.toUpperCase()}
                  </button>
                ))}
              </div>
            </Row>

            {options.waveType !== 'none' && (
              <>
                <Row label="Amplitude" onScrub={(d) => updateOpt('waveAmp', Math.max(0, options.waveAmp + Math.round(d)))} scrubStep={2}>
                  <NumInput
                    min={0}
                    step={10}
                    value={options.waveAmp}
                    onChange={(v) => updateOpt('waveAmp', Math.max(0, v))}
                  />
                </Row>
                <Row label="Cycles" onScrub={(d) => updateOpt('waveCycles', Math.max(0.5, Math.round((options.waveCycles + d * 0.1) * 10) / 10))} scrubStep={1}>
                  <NumInput
                    min={0.5}
                    step={0.5}
                    value={options.waveCycles}
                    onChange={(v) => updateOpt('waveCycles', Math.max(0.1, v))}
                  />
                </Row>
                <Row label="Envelope">
                  <div className={styles.pillGroup}>
                    {(['pinned', 'none', 'fadeIn', 'fadeOut'] as WaveEnvelope[]).map((env) => (
                      <button
                        key={env}
                        type="button"
                        className={`${styles.pill} ${options.waveEnvelope === env ? styles.pillActive : ''}`}
                        onClick={() => updateOpt('waveEnvelope', env)}
                        title={
                          env === 'pinned'
                            ? 'Pinned: Wave dampens to 0 at start and end, preserving endpoints exactly'
                            : env
                        }
                      >
                        {env === 'pinned' ? 'Pinned (Exact)' : env}
                      </button>
                    ))}
                  </div>
                </Row>
              </>
            )}
          </Section>
        </Section>
      )}

      {/* Mode B: Mathematical Presets */}
      {options.mode === 'math' && (
        <Section title="Math Function Presets">
          <div className={styles.presetGrid}>
            {MATH_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`${styles.presetCard} ${options.mathPresetId === p.id ? styles.presetCardActive : ''}`}
                onClick={() => {
                  setOptions((prev) => ({
                    ...prev,
                    mathPresetId: p.id,
                    mathAmp: p.defaultAmp,
                    mathCycles: p.defaultCycles,
                    mathPhase: p.defaultPhase,
                  }));
                }}
              >
                <span className={styles.presetName}>{p.name}</span>
                <span className={styles.presetCategory}>{p.category}</span>
              </button>
            ))}
          </div>

          {/* Beat Range */}
          <Row label="Beat Range">
            <div className={styles.rowInputs}>
              <NumInput
                step="0.25"
                min={0}
                value={options.startBeat}
                onChange={(v) => updateOpt('startBeat', Math.max(0, v))}
                ariaLabel="Start beat"
              />
              <span style={{ color: '#64748b' }}>→</span>
              <NumInput
                step="0.25"
                min={0}
                value={options.endBeat}
                onChange={(v) => updateOpt('endBeat', Math.max(0, v))}
                ariaLabel="End beat"
              />
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => {
                  updateOpt('startBeat', currentBeat);
                  updateOpt('endBeat', currentBeat + 4);
                }}
              >
                Now (+4)
              </button>
            </div>
          </Row>

          <Row label="Center X" onScrub={(d) => updateOpt('mathCenterX', options.mathCenterX + Math.round(d))} scrubStep={2}>
            <NumInput
              step={10}
              value={options.mathCenterX}
              onChange={(v) => updateOpt('mathCenterX', v)}
            />
          </Row>

          <Row label="Amplitude" onScrub={(d) => updateOpt('mathAmp', options.mathAmp + Math.round(d))} scrubStep={2}>
            <NumInput
              step={10}
              value={options.mathAmp}
              onChange={(v) => updateOpt('mathAmp', v)}
            />
          </Row>

          <Row label="Cycles / Freq" onScrub={(d) => updateOpt('mathCycles', Math.max(0.5, Math.round((options.mathCycles + d * 0.1) * 10) / 10))} scrubStep={1}>
            <NumInput
              min={0.2}
              step={0.5}
              value={options.mathCycles}
              onChange={(v) => updateOpt('mathCycles', Math.max(0.1, v))}
            />
          </Row>

          <Row label="Phase (°)" onScrub={(d) => updateOpt('mathPhase', Math.round(options.mathPhase + d))} scrubStep={2}>
            <NumInput
              step={15}
              value={options.mathPhase}
              onChange={(v) => updateOpt('mathPhase', v)}
            />
          </Row>

          {options.mathPresetId === 'custom' && (
            <Row label="Formula x(t)">
              <input
                type="text"
                className={styles.inputNumber}
                value={options.customExpr}
                onChange={(e) => updateOpt('customExpr', e.target.value)}
                placeholder="e.g. 250 * sin(2 * pi * t)"
              />
            </Row>
          )}
        </Section>
      )}

      {/* Density & Stepping Section */}
      <Section title="Note Density & Stepping">
        <Row label="Density Mode">
          <div className={styles.pillGroup}>
            <button
              type="button"
              className={`${styles.pill} ${options.densityMode === 'snap' ? styles.pillActive : ''}`}
              onClick={() => updateOpt('densityMode', 'snap')}
            >
              Beat Grid Snap
            </button>
            <button
              type="button"
              className={`${styles.pill} ${options.densityMode === 'count' ? styles.pillActive : ''}`}
              onClick={() => updateOpt('densityMode', 'count')}
            >
              Fixed Note Count
            </button>
          </div>
        </Row>

        {options.densityMode === 'snap' ? (
          <Row label="Beat Snap">
            <div className={styles.pillGroup}>
              {SNAP_DIVISIONS.map((div) => (
                <button
                  key={div}
                  type="button"
                  className={`${styles.pill} ${options.snapDivision === div ? styles.pillActive : ''}`}
                  onClick={() => updateOpt('snapDivision', div)}
                >
                  1/{div}
                </button>
              ))}
            </div>
          </Row>
        ) : (
          <Row label="Total Notes" onScrub={(d) => updateOpt('totalCount', Math.max(2, Math.min(500, options.totalCount + Math.round(d))))} scrubStep={1}>
            <NumInput
              min={2}
              max={500}
              step={1}
              value={options.totalCount}
              onChange={(v) => updateOpt('totalCount', Math.max(2, Math.min(500, v)))}
            />
          </Row>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          <Check
            label="Include Start"
            checked={options.includeStart}
            onChange={(v) => updateOpt('includeStart', v)}
          />
          <Check
            label="Include End"
            checked={options.includeEnd}
            onChange={(v) => updateOpt('includeEnd', v)}
          />
        </div>
      </Section>

      {/* Note Configuration Section */}
      <Section title="Note Properties">
        <Row label="Target Line">
          <select
            value={options.targetLineId ?? ''}
            onChange={(e) => updateOpt('targetLineId', e.target.value || null)}
          >
            {chart?.lines.map((l, i) => (
              <option key={l.id} value={l.id}>
                #{i}: {l.name || `Line ${i}`}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Note Type">
          <div className={styles.pillGroup}>
            {NOTE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={`${styles.pill} ${options.noteType === t ? styles.pillActive : ''}`}
                onClick={() => updateOpt('noteType', t)}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </Row>

        {options.noteType === 'hold' && (
          <Row label="Hold Length" onScrub={(d) => updateOpt('holdDuration', Math.max(0.1, Math.round((options.holdDuration + d * 0.1) * 10) / 10))} scrubStep={1}>
            <NumInput
              min={0.1}
              step={0.25}
              value={options.holdDuration}
              onChange={(v) => updateOpt('holdDuration', Math.max(0.05, v))}
            />
          </Row>
        )}

        <Row label="Side">
          <div className={styles.pillGroup}>
            {(['above', 'below', 'alternate'] as CurveFillSide[]).map((s) => (
              <button
                key={s}
                type="button"
                className={`${styles.pill} ${options.side === s ? styles.pillActive : ''}`}
                onClick={() => updateOpt('side', s)}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </Row>

        <Check
          label="Decorative (Fake notes)"
          checked={options.fake}
          onChange={(v) => updateOpt('fake', v)}
        />

        <Row label="Speed" onScrub={(d) => updateOpt('speed', Math.max(0.1, Math.round((options.speed + d * 0.05) * 100) / 100))} scrubStep={1}>
          <NumInput
            min={0.1}
            step={0.05}
            value={options.speed}
            onChange={(v) => updateOpt('speed', Math.max(0.1, v))}
          />
        </Row>
      </Section>

      {/* Live SVG Preview */}
      <CurveFillingPreview options={options} sampledNotes={sampledNotes} />

      {/* Notification Banner */}
      {notification && <div className={styles.banner}>{notification}</div>}

      {/* Generate Action Button */}
      <button
        type="button"
        className={styles.generateBtn}
        disabled={!sampledNotes.length}
        onClick={handleGenerate}
      >
        <span>Generate {sampledNotes.length} notes</span>
      </button>
    </div>
  );
}
