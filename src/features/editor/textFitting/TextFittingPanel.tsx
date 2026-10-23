import { useEffect, useMemo, useState } from 'react';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import { beatToSeconds, secondsToBeat } from '@/features/chart/model/timing';
import { lineRuntime } from '@/features/chart/runtime/scene';
import { useLibraryStore } from '@/features/library/useLibraryStore';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useEditorStore } from '../useEditorStore';
import { Row } from '../SidePanel/fields';
import { sampleTextNotes } from './sampler';
import { commitTextNotes } from './generator';
import { TextFittingPreview } from './TextFittingPreview';
import type {
  TextFittingMode,
  TextFittingOptions,
  TimingDistributionMode,
} from './types';
import type { NoteType } from '@/features/chart/model/types';
import styles from './TextFittingPanel.module.css';

const QUICK_PRESETS = ['PHIGROS', '100%', 'PERFECT', 'FULL COMBO', 'GG', '3 2 1 GO', 'FALL'];

const BASE_FONTS = [
  { id: 'Saira', label: 'Saira (Default)' },
  { id: 'sans-serif', label: 'Sans-Serif' },
  { id: 'Impact', label: 'Impact (Bold & Heavy)' },
  { id: 'serif', label: 'Serif' },
  { id: 'monospace', label: 'Monospace' },
];

export function TextFittingPanel() {
  return (
    <ErrorBoundary fallbackTitle="Text-to-Notes generator encountered an error">
      <TextFittingPanelInner />
    </ErrorBoundary>
  );
}

function TextFittingPanelInner() {
  const chart = useChartStore((s) => s.chart);
  const currentTime = useEditorStore((s) => s.time);
  const selectedLineId = useEditorStore((s) => s.selectedLineId);
  const projectFonts = useLibraryStore((s) => s.fonts);

  const activeLineId = selectedLineId ?? chart?.lines[0]?.id ?? null;

  const currentBeat = useMemo(() => {
    if (!chart) return 0;
    return Math.max(0, Math.round(secondsToBeat(chart.bpmList, currentTime) * 4) / 4);
  }, [chart, currentTime]);

  const fontOptions = useMemo(() => {
    const list = [...BASE_FONTS];
    if (projectFonts) {
      for (const name of Object.keys(projectFonts)) {
        list.push({ id: name, label: `Custom: ${name}` });
      }
    }
    return list;
  }, [projectFonts]);

  // Options state
  const [text, setText] = useState('PHIGROS');
  const [fontFamily, setFontFamily] = useState('Saira');
  const [fontWeight, setFontWeight] = useState<'normal' | 'bold'>('bold');
  const [mode, setMode] = useState<TextFittingMode>('skeleton');
  const [noteType, setNoteType] = useState<NoteType>('drag');
  const [timingMode, setTimingMode] = useState<TimingDistributionMode>('simultaneous');

  const [targetWidth, setTargetWidth] = useState(600);
  const [spacing, setSpacing] = useState(26);
  const [centerX, setCenterX] = useState(0);
  const [centerY, setCenterY] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [noteSize, setNoteSize] = useState(1);
  const [above, setAbove] = useState(true);
  const [fake, setFake] = useState(true); // Decorative fake notes by default
  const [alignToLine, setAlignToLine] = useState(false);

  const [startBeat, setStartBeat] = useState(currentBeat);
  const [endBeat, setEndBeat] = useState(currentBeat + 4);

  const [targetLineId, setTargetLineId] = useState<string | null>(activeLineId);
  const [viewMode, setViewMode] = useState<'fit' | 'playfield'>('playfield');
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Line position lookup if aligning
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

  const options: TextFittingOptions = useMemo(
    () => ({
      text,
      fontFamily,
      fontWeight,
      mode,
      spacing,
      targetWidth,
      centerX,
      centerY,
      rotation,
      noteType,
      noteSize,
      speed,
      above,
      fake,
      alignToLine,
      targetLineId: targetLineId ?? activeLineId,
      timingMode,
      startBeat,
      endBeat,
    }),
    [
      text,
      fontFamily,
      fontWeight,
      mode,
      spacing,
      targetWidth,
      centerX,
      centerY,
      rotation,
      noteType,
      noteSize,
      speed,
      above,
      fake,
      alignToLine,
      targetLineId,
      activeLineId,
      timingMode,
      startBeat,
      endBeat,
    ],
  );

  const fittedPoints = useMemo(() => {
    return sampleTextNotes(options, alignToLine ? currentLinePos : undefined);
  }, [options, alignToLine, currentLinePos]);

  // Sync ghost notes to gameplay canvas overlay
  useEffect(() => {
    useEditorStore.getState().set({
      textFittingGhost: {
        notes: fittedPoints.map((p) => ({
          x: p.x,
          y: p.y,
          type: noteType,
        })),
      },
    });
    return () => {
      useEditorStore.getState().set({ textFittingGhost: null });
    };
  }, [fittedPoints, noteType]);

  const handleGenerate = () => {
    if (timingMode !== 'simultaneous' && endBeat <= startBeat) {
      setNotification({
        type: 'error',
        message: 'End beat must be strictly greater than start beat for sweep timing.',
      });
      return;
    }

    const result = commitTextNotes(fittedPoints, options);
    if (result.success) {
      setNotification({ type: 'success', message: result.message ?? 'Notes generated!' });
      setTimeout(() => setNotification(null), 4000);
    } else {
      setNotification({ type: 'error', message: result.message ?? 'Generation failed.' });
    }
  };

  return (
    <div className={styles.container}>
      {/* Text input */}
      <label className={styles.row}>
        <span>Text</span>
        <input
          className={styles.textInput}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter text..."
        />
      </label>

      {/* Quick Presets */}
      <div className={styles.pillsRow}>
        {QUICK_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className={styles.pill}
            onClick={() => setText(p)}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Fitting Mode Tabs */}
      <div className={styles.modeTabs}>
        <button
          type="button"
          className={mode === 'skeleton' ? styles.modeTabActive : styles.modeTab}
          onClick={() => setMode('skeleton')}
          title="Thin center skeleton stroke (minimizes duplicate note clutter)"
        >
          Skeleton
        </button>
        <button
          type="button"
          className={mode === 'contour' ? styles.modeTabActive : styles.modeTab}
          onClick={() => setMode('contour')}
          title="Outer boundary contours"
        >
          Contour
        </button>
        <button
          type="button"
          className={mode === 'fill' ? styles.modeTabActive : styles.modeTab}
          onClick={() => setMode('fill')}
          title="Solid dot matrix fill"
        >
          Matrix
        </button>
      </div>

      {/* Font & Weight */}
      <label className={styles.row}>
        <span>Font</span>
        <select
          className={styles.select}
          value={fontFamily}
          onChange={(e) => setFontFamily(e.target.value)}
        >
          {fontOptions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.row}>
        <span>Font weight</span>
        <select
          className={styles.select}
          value={fontWeight}
          onChange={(e) => setFontWeight(e.target.value as 'normal' | 'bold')}
        >
          <option value="bold">Bold (Recommended)</option>
          <option value="normal">Regular</option>
        </select>
      </label>

      {/* Target Line */}
      <label className={styles.row}>
        <span>Target line</span>
        <select
          className={styles.select}
          value={targetLineId ?? activeLineId ?? ''}
          onChange={(e) => setTargetLineId(e.target.value)}
        >
          {chart?.lines.map((l, i) => (
            <option key={l.id} value={l.id}>
              #{i}: {l.name || `Line ${i}`}
            </option>
          ))}
        </select>
      </label>

      {/* Note Configuration */}
      <div className={styles.groupTitle}>Note Settings</div>

      <label className={styles.row}>
        <span>Note type</span>
        <select
          className={styles.select}
          value={noteType}
          onChange={(e) => setNoteType(e.target.value as NoteType)}
        >
          <option value="drag">Drag (Yellow, no tap required)</option>
          <option value="tap">Tap (Sky Blue)</option>
          <option value="flick">Flick (Crimson Red)</option>
        </select>
      </label>

      <label className={styles.row}>
        <span title="Decorative fake notes do not impact player combo or score">
          Decorative (Fake notes)
        </span>
        <input
          type="checkbox"
          checked={fake}
          onChange={(e) => setFake(e.target.checked)}
        />
      </label>

      <label className={styles.row}>
        <span>Above judgment line</span>
        <input
          type="checkbox"
          checked={above}
          onChange={(e) => setAbove(e.target.checked)}
        />
      </label>

      <Row
        label="Note speed"
        onScrub={(d) => setSpeed((v) => Math.max(0.1, Math.round((v + d) * 10) / 10))}
        scrubStep={0.1}
      >
        <input
          className={styles.input}
          type="number"
          step="0.1"
          min="0.1"
          max="10"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value) || 1)}
        />
      </Row>

      <Row
        label="Note size"
        onScrub={(d) => setNoteSize((v) => Math.max(0.2, Math.min(3, Math.round((v + d) * 10) / 10)))}
        scrubStep={0.05}
      >
        <input
          className={styles.input}
          type="number"
          step="0.1"
          min="0.2"
          max="3"
          value={noteSize}
          onChange={(e) => setNoteSize(Number(e.target.value) || 1)}
        />
      </Row>

      {/* Geometry & Layout */}
      <div className={styles.groupTitle}>Dimensions & Layout</div>

      <Row
        label="Target width"
        onScrub={(d) => setTargetWidth((w) => Math.max(80, Math.min(1300, Math.round(w + d))))}
        scrubStep={10}
      >
        <div className={styles.sliderRow}>
          <input
            className={styles.slider}
            type="range"
            min={100}
            max={1200}
            step={10}
            value={targetWidth}
            onChange={(e) => setTargetWidth(Number(e.target.value))}
          />
          <input
            className={styles.input}
            type="number"
            min={100}
            max={1200}
            step={10}
            value={targetWidth}
            onChange={(e) => setTargetWidth(Number(e.target.value) || 600)}
          />
        </div>
      </Row>

      <Row
        label="Note spacing"
        onScrub={(d) => setSpacing((s) => Math.max(10, Math.min(80, Math.round(s + d))))}
        scrubStep={1}
      >
        <div className={styles.sliderRow}>
          <input
            className={styles.slider}
            type="range"
            min={10}
            max={70}
            step={2}
            value={spacing}
            onChange={(e) => setSpacing(Number(e.target.value))}
          />
          <input
            className={styles.input}
            type="number"
            min={10}
            max={70}
            step={2}
            value={spacing}
            onChange={(e) => setSpacing(Number(e.target.value) || 26)}
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
            onChange={(e) => setCenterX(Number(e.target.value) || 0)}
          />
          <input
            className={styles.input}
            type="number"
            step={10}
            value={centerY}
            placeholder="Y"
            onChange={(e) => setCenterY(Number(e.target.value) || 0)}
          />
        </div>
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
            onChange={(e) => setRotation(Number(e.target.value) || 0)}
          />
        </div>
      </Row>

      <label className={styles.row}>
        <span title="Aligns the text relative to the judgment line's position at start beat">
          Align to line pos
        </span>
        <input
          type="checkbox"
          checked={alignToLine}
          onChange={(e) => setAlignToLine(e.target.checked)}
        />
      </label>

      {/* Timing Settings */}
      <div className={styles.groupTitle}>Timing & Distribution</div>

      <label className={styles.row}>
        <span>Distribution</span>
        <select
          className={styles.select}
          value={timingMode}
          onChange={(e) => setTimingMode(e.target.value as TimingDistributionMode)}
        >
          <option value="simultaneous">Simultaneous (Hit all at once)</option>
          <option value="leftToRight">Sweep: Left to Right</option>
          <option value="topToBottom">Sweep: Top to Bottom</option>
          <option value="strokeOrder">Sweep: Stroke Order</option>
          <option value="random">Random Scatter</option>
        </select>
      </label>

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
            onChange={(e) => setStartBeat(Number(e.target.value) || 0)}
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

      {timingMode !== 'simultaneous' && (
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
            onChange={(e) => setEndBeat(Number(e.target.value) || 1)}
          />
        </Row>
      )}

      {/* Interactive Preview */}
      <div className={styles.groupTitle}>Live Note Preview</div>
      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)', marginBottom: 'var(--sp-1)' }}>
        Live ghost notes are visible on the playfield canvas. Click below to add them to the chart.
      </div>
      <TextFittingPreview
        points={fittedPoints}
        options={options}
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
          disabled={!chart || !activeLineId || fittedPoints.length === 0}
        >
          Generate {fittedPoints.length} notes
        </button>
      </div>
    </div>
  );
}
