import { useEffect, useMemo, useState } from 'react';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import { beatToSeconds, secondsToBeat } from '@/features/chart/model/timing';
import { lineRuntime } from '@/features/chart/runtime/scene';
import { useEditorStore } from '../useEditorStore';
import { Row } from '../SidePanel/fields';
import { PRESETS, PRESET_MAP } from './presets';
import { sampleTrajectory } from './sampler';
import { commitTrajectory } from './generator';
import { TrajectoryPreview } from './TrajectoryPreview';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import type { CurveCategory, CurveMode, TrajectoryOptions } from './types';
import styles from './TrajectoryPanel.module.css';

const CATEGORIES: { id: CurveCategory; label: string }[] = [
  { id: 'basic', label: 'Shapes' },
  { id: 'waves', label: 'Waves' },
  { id: 'spirals', label: 'Spirals' },
  { id: 'curves', label: 'Curves' },
  { id: 'custom', label: 'Custom' },
];

export function TrajectoryPanel() {
  return (
    <ErrorBoundary fallbackTitle="Trajectory generator encountered an error">
      <TrajectoryPanelInner />
    </ErrorBoundary>
  );
}

function TrajectoryPanelInner() {
  const chart = useChartStore((s) => s.chart);
  const currentTime = useEditorStore((s) => s.time);
  const selectedLineId = useEditorStore((s) => s.selectedLineId);
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId);

  // Default target line
  const activeLineId = selectedLineId ?? chart?.lines[0]?.id ?? null;
  const activeLine = chart?.lines.find((l) => l.id === activeLineId);
  const activeLayerId = selectedLayerId ?? activeLine?.layers[0]?.id ?? null;

  const currentBeat = useMemo(() => {
    if (!chart) return 0;
    return Math.max(0, Math.round(secondsToBeat(chart.bpmList, currentTime) * 4) / 4);
  }, [chart, currentTime]);

  const [category, setCategory] = useState<CurveCategory>('basic');
  const [presetId, setPresetId] = useState<string>('circle');
  const [targetLineId, setTargetLineId] = useState<string | null>(activeLineId);
  const [targetLayerId, setTargetLayerId] = useState<string | null>(activeLayerId);

  const [startBeat, setStartBeat] = useState<number>(currentBeat);
  const [endBeat, setEndBeat] = useState<number>(currentBeat + 4);

  const initialPreset = PRESET_MAP.get('circle')!;
  const [mode, setMode] = useState<CurveMode>(initialPreset.mode);
  const [params, setParams] = useState<Record<string, number>>({});

  const [customExprX, setCustomExprX] = useState('cos(t)');
  const [customExprY, setCustomExprY] = useState('sin(t)');
  const [customExprR, setCustomExprR] = useState('1');
  const [customExprTheta, setCustomExprTheta] = useState('t');

  const [tMin, setTMin] = useState(initialPreset.defaultTMin);
  const [tMax, setTMax] = useState(initialPreset.defaultTMax);
  const [segments, setSegments] = useState(initialPreset.defaultSegments);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(1);
  const [scaleX, setScaleX] = useState(initialPreset.defaultScaleX);
  const [scaleY, setScaleY] = useState(initialPreset.defaultScaleY);
  const [rotation, setRotation] = useState(0);
  const [centerX, setCenterX] = useState(0);
  const [centerY, setCenterY] = useState(0);
  const [alignStart, setAlignStart] = useState(false);
  const [autoTangent, setAutoTangent] = useState(true);
  const [tangentOffset, setTangentOffset] = useState(0);
  const [replaceExisting, setReplaceExisting] = useState(true);

  const [viewMode, setViewMode] = useState<'fit' | 'playfield'>('playfield');
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Switch preset
  const selectPreset = (id: string) => {
    setPresetId(id);
    const p = PRESET_MAP.get(id);
    if (!p) return;
    setMode(p.mode);
    setTMin(p.defaultTMin);
    setTMax(p.defaultTMax);
    setSegments(p.defaultSegments);
    setScaleX(p.defaultScaleX);
    setScaleY(p.defaultScaleY);
    const initialParams: Record<string, number> = {};
    for (const d of p.paramDefs) {
      initialParams[d.name] = d.default;
    }
    setParams(initialParams);
  };

  const handleCategoryChange = (cat: CurveCategory) => {
    setCategory(cat);
    const firstInCat = PRESETS.find((p) => p.category === cat);
    if (firstInCat) {
      selectPreset(firstInCat.id);
    }
  };

  // Sample start position from line runtime if aligning
  const currentLinePos = useMemo(() => {
    try {
      if (!chart || !targetLineId) return { x: 0, y: 0 };
      const line = chart.lines.find((l) => l.id === targetLineId);
      if (!line) return { x: 0, y: 0 };
      const beat = Number.isFinite(startBeat) ? startBeat : 0;
      const time = beatToSeconds(chart.bpmList, beat);
      const state = lineRuntime(line, chart.bpmList).localState(time);
      const x = Number.isFinite(state?.x) ? Math.round(state.x) : 0;
      const y = Number.isFinite(state?.y) ? Math.round(state.y) : 0;
      return { x, y };
    } catch {
      return { x: 0, y: 0 };
    }
  }, [chart, targetLineId, startBeat]);

  const options: TrajectoryOptions = useMemo(
    () => ({
      presetId,
      mode,
      customExprX,
      customExprY,
      customExprR,
      customExprTheta,
      params,
      tMin,
      tMax,
      segments,
      trimStart,
      trimEnd,
      scaleX,
      scaleY,
      rotation,
      centerX,
      centerY,
      alignStart,
      startX: currentLinePos.x,
      startY: currentLinePos.y,
      autoTangent,
      tangentOffset,
      startBeat,
      endBeat,
      targetLineId: targetLineId ?? activeLineId,
      targetLayerId: targetLayerId ?? activeLayerId,
    }),
    [
      presetId,
      mode,
      customExprX,
      customExprY,
      customExprR,
      customExprTheta,
      params,
      tMin,
      tMax,
      segments,
      trimStart,
      trimEnd,
      scaleX,
      scaleY,
      rotation,
      centerX,
      centerY,
      alignStart,
      currentLinePos,
      autoTangent,
      tangentOffset,
      startBeat,
      endBeat,
      targetLineId,
      activeLineId,
      targetLayerId,
      activeLayerId,
    ],
  );

  const sampledPoints = useMemo(() => sampleTrajectory(options), [options]);

  useEffect(() => {
    useEditorStore.getState().set({
      trajectoryGhost: { points: sampledPoints, autoTangent },
    });
    return () => {
      useEditorStore.getState().set({ trajectoryGhost: null });
    };
  }, [sampledPoints, autoTangent]);

  const handleGenerate = () => {
    if (endBeat <= startBeat) {
      setNotification({ type: 'error', message: 'End beat must be strictly greater than start beat' });
      return;
    }
    const result = commitTrajectory(options, replaceExisting);
    if (result.success) {
      setNotification({
        type: 'success',
        message: `Generated ${result.eventCount} trajectory events (${segments} segments)`,
      });
      setTimeout(() => setNotification(null), 4000);
    } else {
      setNotification({ type: 'error', message: result.message ?? 'Generation failed' });
    }
  };

  const categoryPresets = useMemo(
    () => PRESETS.filter((p) => p.category === category),
    [category],
  );
  const activePreset = PRESET_MAP.get(presetId) ?? categoryPresets[0] ?? PRESETS[0];
  const currentPreset = activePreset;
  const effectivePresetId = categoryPresets.some((p) => p.id === presetId)
    ? presetId
    : activePreset.id;

  return (
    <div className={styles.container}>
      {/* Category selector */}
      <div className={styles.categoryTabs}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={c.id === category ? styles.categoryTabActive : styles.categoryTab}
            onClick={() => handleCategoryChange(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Preset select */}
      <label className={styles.row}>
        <span>Preset</span>
        <select
          className={styles.select}
          value={effectivePresetId}
          onChange={(e) => selectPreset(e.target.value)}
        >
          {categoryPresets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {/* Target Line and Layer */}
      <label className={styles.row}>
        <span>Target line</span>
        <select
          className={styles.select}
          value={targetLineId ?? activeLineId ?? ''}
          onChange={(e) => {
            const lineId = e.target.value;
            setTargetLineId(lineId);
            const line = chart?.lines.find((l) => l.id === lineId);
            setTargetLayerId(line?.layers[0]?.id ?? null);
          }}
        >
          {chart?.lines.map((l, i) => (
            <option key={l.id} value={l.id}>
              #{i}: {l.name || `Line ${i}`}
            </option>
          ))}
        </select>
      </label>

      {/* Target Layer */}
      {activeLine && activeLine.layers.length > 1 && (
        <label className={styles.row}>
          <span>Layer</span>
          <select
            className={styles.select}
            value={targetLayerId ?? activeLayerId ?? ''}
            onChange={(e) => setTargetLayerId(e.target.value)}
          >
            {activeLine.layers.map((ly, idx) => (
              <option key={ly.id} value={ly.id}>
                {ly.name || `Layer ${idx + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Beat Range */}
      <Row
        label="Start beat"
        onScrub={(d) => setStartBeat((b) => Math.max(0, Math.round((b + d) * 4) / 4))}
        scrubStep={0.25}
      >
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input
            className={styles.input}
            type="number"
            step="0.25"
            value={startBeat}
            onChange={(e) => setStartBeat(Number(e.target.value))}
          />
          <button
            type="button"
            className={styles.secondaryBtn}
            title="Snap to current playhead beat"
            onClick={() => {
              setStartBeat(currentBeat);
              setEndBeat(currentBeat + Math.max(1, endBeat - startBeat));
            }}
          >
            Now
          </button>
        </div>
      </Row>

      <Row
        label="End beat"
        onScrub={(d) => setEndBeat((b) => Math.max(0.25, Math.round((b + d) * 4) / 4))}
        scrubStep={0.25}
      >
        <input
          className={styles.input}
          type="number"
          step="0.25"
          value={endBeat}
          onChange={(e) => setEndBeat(Number(e.target.value))}
        />
      </Row>

      {/* Dynamic Preset Parameters */}
      {currentPreset && currentPreset.paramDefs.length > 0 && (
        <>
          <div className={styles.groupTitle}>Preset parameters</div>
          {currentPreset.paramDefs.map((p) => {
            const rawVal = params[p.name];
            const val = Number.isFinite(rawVal) ? rawVal : p.default;
            return (
              <Row
                key={p.name}
                label={p.label}
                onScrub={(d) =>
                  setParams((prev) => {
                    const currentVal = Number.isFinite(prev[p.name]) ? prev[p.name] : p.default;
                    const nextVal = Math.min(
                      p.max,
                      Math.max(p.min, Math.round((currentVal + d) * 100) / 100),
                    );
                    return {
                      ...prev,
                      [p.name]: Number.isFinite(nextVal) ? nextVal : p.default,
                    };
                  })
                }
                scrubStep={p.step}
              >
                <div className={styles.sliderRow}>
                  <input
                    className={styles.slider}
                    type="range"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={val}
                    onChange={(e) => {
                      const num = Number(e.target.value);
                      setParams((prev) => ({
                        ...prev,
                        [p.name]: Number.isFinite(num) ? num : p.default,
                      }));
                    }}
                  />
                  <input
                    className={styles.input}
                    type="number"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={val}
                    onChange={(e) => {
                      const num = Number(e.target.value);
                      setParams((prev) => ({
                        ...prev,
                        [p.name]: Number.isFinite(num) ? num : p.default,
                      }));
                    }}
                  />
                </div>
              </Row>
            );
          })}
        </>
      )}

      {/* Custom Expression inputs if presetId === 'custom' */}
      {presetId === 'custom' && (
        <>
          <div className={styles.groupTitle}>Custom formula</div>
          <label className={styles.row}>
            <span>Mode</span>
            <select
              className={styles.select}
              value={mode}
              onChange={(e) => setMode(e.target.value as CurveMode)}
            >
              <option value="parametric">Parametric (x(t), y(t))</option>
              <option value="polar">Polar (r(t), θ(t))</option>
            </select>
          </label>
          {mode === 'parametric' ? (
            <>
              <label className={styles.row}>
                <span>x(t)</span>
                <input
                  className={styles.inputWide}
                  value={customExprX}
                  onChange={(e) => setCustomExprX(e.target.value)}
                  placeholder="cos(t)"
                />
              </label>
              <label className={styles.row}>
                <span>y(t)</span>
                <input
                  className={styles.inputWide}
                  value={customExprY}
                  onChange={(e) => setCustomExprY(e.target.value)}
                  placeholder="sin(t)"
                />
              </label>
            </>
          ) : (
            <>
              <label className={styles.row}>
                <span>r(t)</span>
                <input
                  className={styles.inputWide}
                  value={customExprR}
                  onChange={(e) => setCustomExprR(e.target.value)}
                  placeholder="1"
                />
              </label>
              <label className={styles.row}>
                <span>θ(t)</span>
                <input
                  className={styles.inputWide}
                  value={customExprTheta}
                  onChange={(e) => setCustomExprTheta(e.target.value)}
                  placeholder="t"
                />
              </label>
            </>
          )}
          <div className={styles.row}>
            <span>t range</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                className={styles.input}
                type="number"
                step="0.5"
                value={tMin}
                onChange={(e) => setTMin(Number(e.target.value))}
                placeholder="tMin"
              />
              <span style={{ color: 'var(--c-text-muted)', alignSelf: 'center' }}>→</span>
              <input
                className={styles.input}
                type="number"
                step="0.5"
                value={tMax}
                onChange={(e) => setTMax(Number(e.target.value))}
                placeholder="tMax"
              />
            </div>
          </div>
        </>
      )}

      {/* Transforms & Sampling */}
      <div className={styles.groupTitle}>Sampling & Transforms</div>

      <Row
        label="Segments"
        onScrub={(d) => setSegments((s) => Math.min(128, Math.max(4, Math.round(s + d))))}
        scrubStep={1}
      >
        <div className={styles.sliderRow}>
          <input
            className={styles.slider}
            type="range"
            min={4}
            max={128}
            step={4}
            value={segments}
            onChange={(e) => setSegments(Number(e.target.value))}
          />
          <input
            className={styles.input}
            type="number"
            min={4}
            max={128}
            step={4}
            value={segments}
            onChange={(e) => setSegments(Number(e.target.value))}
          />
        </div>
      </Row>

      <Row
        label="Scale X"
        onScrub={(d) => setScaleX((v) => Math.round(v + d))}
        scrubStep={5}
      >
        <input
          className={styles.input}
          type="number"
          step={20}
          value={scaleX}
          onChange={(e) => setScaleX(Number(e.target.value))}
        />
      </Row>

      <Row
        label="Scale Y"
        onScrub={(d) => setScaleY((v) => Math.round(v + d))}
        scrubStep={5}
      >
        <input
          className={styles.input}
          type="number"
          step={20}
          value={scaleY}
          onChange={(e) => setScaleY(Number(e.target.value))}
        />
      </Row>

      <Row
        label="Rotation"
        onScrub={(d) => setRotation((v) => Math.round(v + d))}
        scrubStep={1}
      >
        <div className={styles.sliderRow}>
          <input
            className={styles.slider}
            type="range"
            min={-180}
            max={180}
            step={5}
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value))}
          />
          <input
            className={styles.input}
            type="number"
            min={-180}
            max={180}
            step={5}
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value))}
          />
        </div>
      </Row>

      <Row
        label="Center offset"
        onScrub={(d) => setCenterX((v) => Math.round(v + d))}
        scrubStep={5}
      >
        <div style={{ display: 'flex', gap: '4px' }}>
          <input
            className={styles.input}
            type="number"
            step={10}
            value={centerX}
            placeholder="X"
            onChange={(e) => setCenterX(Number(e.target.value))}
          />
          <input
            className={styles.input}
            type="number"
            step={10}
            value={centerY}
            placeholder="Y"
            onChange={(e) => setCenterY(Number(e.target.value))}
          />
        </div>
      </Row>

      <label className={styles.row}>
        <span title="Aligns the starting point of the curve with the line's position at start beat">
          Align start to line pos
        </span>
        <input
          type="checkbox"
          checked={alignStart}
          onChange={(e) => setAlignStart(e.target.checked)}
        />
      </label>

      {/* Trimming */}
      <div className={styles.row}>
        <span>Trim start / end</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input
            className={styles.input}
            type="number"
            min={0}
            max={0.95}
            step={0.05}
            value={trimStart}
            onChange={(e) => setTrimStart(Number(e.target.value))}
          />
          <span style={{ color: 'var(--c-text-muted)', alignSelf: 'center' }}>→</span>
          <input
            className={styles.input}
            type="number"
            min={0.05}
            max={1}
            step={0.05}
            value={trimEnd}
            onChange={(e) => setTrimEnd(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Auto-Tangent Rotation */}
      <div className={styles.groupTitle}>Auto-tangent rotation</div>

      <label className={styles.row}>
        <span>Enable auto-tangent</span>
        <input
          type="checkbox"
          checked={autoTangent}
          onChange={(e) => setAutoTangent(e.target.checked)}
        />
      </label>

      {autoTangent && (
        <Row
          label="Angle offset"
          onScrub={(d) => setTangentOffset((v) => Math.round(v + d))}
          scrubStep={1}
        >
          <div className={styles.sliderRow}>
            <input
              className={styles.slider}
              type="range"
              min={-180}
              max={180}
              step={15}
              value={tangentOffset}
              onChange={(e) => setTangentOffset(Number(e.target.value))}
            />
            <input
              className={styles.input}
              type="number"
              min={-180}
              max={180}
              step={15}
              value={tangentOffset}
              onChange={(e) => setTangentOffset(Number(e.target.value))}
            />
          </div>
        </Row>
      )}

      <label className={styles.row}>
        <span>Replace events in range</span>
        <input
          type="checkbox"
          checked={replaceExisting}
          onChange={(e) => setReplaceExisting(e.target.checked)}
        />
      </label>

      {/* Live Preview */}
      <div className={styles.groupTitle}>Live path preview</div>
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)', marginBottom: 'var(--sp-1)' }}>
        Live path is shown on the playfield canvas in cyan. Click button below to write events into the chart.
      </div>
      <TrajectoryPreview
        points={sampledPoints}
        autoTangent={autoTangent}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode((m) => (m === 'fit' ? 'playfield' : 'fit'))}
      />

      {/* Notification banner */}
      {notification && (
        <div
          className={`${styles.notification} ${
            notification.type === 'success' ? styles.success : styles.error
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Action button */}
      <div className={styles.buttonRow}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={handleGenerate}
          disabled={!chart || !activeLineId}
        >
          Generate curve trajectory
        </button>
      </div>
    </div>
  );
}
