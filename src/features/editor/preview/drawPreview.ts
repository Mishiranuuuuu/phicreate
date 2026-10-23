import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/features/chart/model/defaults';
import { toCss } from '@/features/chart/model/color';
import type { Chart, Color, JudgeLine, MediaFit, TextObject } from '@/features/chart/model/types';
import {
  createSampler,
  isNoteVisible,
  lineRuntime,
  noteState,
  sampleMedia,
  sampleNoiseFields,
  sampleTexts,
  type LineState,
  type NoteEntry,
} from '@/features/chart/runtime/scene';
import { ease } from '@/features/chart/model/easing';
import type { NoiseQuality } from '@/features/settings/types';
import { applyShaders, type ShaderPass } from '@/features/shaders/pipeline';
import { getBackground } from './background';
import { drawNoiseFields } from './drawNoise';
import { fontFamily } from './fonts';
import { frameFor } from './frameCache';
import { beginMediaFrame, getMedia, mediaFrame } from './media';
import { NO_PASSES, type ActivePasses } from './shaderPasses';
import { chartVariables, expandText, type ProjectInfo } from './variables';
import {
  getImage,
  headImage,
  HIT_DURATION,
  HIT_FRAME_SECONDS,
  HIT_FRAMES,
  holdImages,
  tinted,
} from './skin';

// Visual constants follow RPE's preview.
const NOTE_WIDTH = 175;
const LINE_WIDTH = 4000;
const LINE_HEIGHT = 7.5;
const SELECTED_LINE_COLOR = '#39ff14';
const BEARING_RADIUS = 10;
const BEARING_LENGTH = 30;
const HIT_COLOR: [number, number, number] = [255, 236, 160];
const HIT_SIZE = NOTE_WIDTH * 1.4;
const HIT_LIFETIME = Math.max(HIT_DURATION, 2 / 3);
const HOLD_HIT_INTERVAL = 20 / 120;
const BACKGROUND_ALPHA = 0.35;
const BAR_ALPHA = 0.55;
const FALLBACK_COLORS = { tap: '#0ac3ff', drag: '#f0ed69', flick: '#fe4365', hold: '#0ac3ff' };

export interface PreviewOptions {
  // Hits before this chart time get no effects (Infinity = none).
  effectsSince: number;
  hiddenLines?: Set<string>;
  aspect: number;
  fov: number;
  selectedLineId: string | null;
  // Outlines a selected noise field.
  selectedObjectId?: string | null;
  info: ProjectInfo;
  // Videos play along while true.
  playing: boolean;
  rate: number;
  // Song length in seconds, for the progress bar.
  duration: number;
  // Shader effects active at t.
  shaders?: ActivePasses;
  noiseQuality?: NoiseQuality;
  backgroundBlur?: boolean;
  highlightSimultaneous?: boolean;
  // Green selected line and selected noise field outline.
  highlightSelected?: boolean;
  // Marks the selected object's origin and up direction.
  bearingMarker?: boolean;
  // Marks the selected judgement line's anchor point and center point.
  showAnchorMarker?: boolean;
  hideUI?: boolean;
  hideText?: boolean;
  hideMedia?: boolean;
  hideNoise?: boolean;
  overflowPreview?: boolean;
  trajectoryGhost?: { points: { x: number; y: number; angle: number }[]; autoTangent: boolean } | null;
  textFittingGhost?: { notes: { x: number; y: number; type: 'tap' | 'drag' | 'hold' | 'flick' }[] } | null;
  curveFillGhost?: {
    targetLineId: string | null;
    notes: { x: number; y: number; beat: number; lineX: number; type: 'tap' | 'drag' | 'hold' | 'flick'; above: boolean }[];
    pathPoints?: { x: number; y: number }[];
  } | null;
}

// The play frame is CANVAS_HEIGHT tall and CANVAS_HEIGHT * aspect wide, fitted then zoomed by 1 / fov.
// Sizes use `scale`; horizontal positions stretch by `scaleX` so the chart's width maps to the frame's.
export function previewViewport(width: number, height: number, aspect: number, fov: number) {
  const frameW = CANVAS_HEIGHT * aspect;
  const scale = Math.min(width / frameW, height / CANVAS_HEIGHT) / fov;
  const w = frameW * scale;
  const h = CANVAS_HEIGHT * scale;
  return {
    scale,
    scaleX: w / CANVAS_WIDTH,
    left: (width - w) / 2,
    top: (height - h) / 2,
    width: w,
    height: h,
  };
}

// Source rect that cover-fits an image into the given aspect.
function coverRect(img: { width: number; height: number }, aspect: number) {
  const w = Math.min(img.width, img.height * aspect);
  const h = w / aspect;
  return [(img.width - w) / 2, (img.height - h) / 2, w, h] as const;
}

const NO_IDS = new Set<string>();
const simultaneousCache = new WeakMap<Chart, Set<string>>();

// Notes sharing a hit time with another note get highlight textures.
function simultaneous(chart: Chart) {
  let set = simultaneousCache.get(chart);
  if (set) return set;
  const byTime = new Map<number, string[]>();
  for (const line of chart.lines) {
    for (const e of lineRuntime(line, chart.bpmList).notes) {
      const key = Math.round(e.start * 1e6);
      const ids = byTime.get(key);
      if (ids) ids.push(e.note.id);
      else byTime.set(key, [e.note.id]);
    }
  }
  set = new Set([...byTime.values()].filter((ids) => ids.length > 1).flat());
  simultaneousCache.set(chart, set);
  return set;
}

export function drawPreview(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  chart: Chart,
  t: number,
  {
    effectsSince,
    hiddenLines,
    aspect,
    fov,
    selectedLineId,
    selectedObjectId = null,
    info,
    playing,
    rate,
    duration,
    shaders = NO_PASSES,
    noiseQuality = 'simplified',
    backgroundBlur = true,
    highlightSimultaneous = true,
    highlightSelected = true,
    bearingMarker = false,
    showAnchorMarker = true,
    hideUI = false,
    hideText = false,
    hideMedia = false,
    hideNoise = false,
    overflowPreview = true,
    trajectoryGhost,
    textFittingGhost,
    curveFillGhost,
  }: PreviewOptions,
) {
  const vp = previewViewport(width, height, aspect, fov);
  const { scale, scaleX } = vp;
  beginMediaFrame();
  const cx = width / 2;
  const cy = height / 2;

  ctx.save();
  // Zoomed out past 1 or overflow preview enabled: content outside the frame stays visible.
  if (fov <= 1 && !overflowPreview) {
    ctx.beginPath();
    ctx.rect(vp.left, vp.top, vp.width, vp.height);
    ctx.clip();
  }
  ctx.fillStyle = overflowPreview ? '#0a0a0a' : '#111';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#111';
  ctx.fillRect(vp.left, vp.top, vp.width, vp.height);
  const bg = getBackground(backgroundBlur);
  if (bg) {
    ctx.globalAlpha = BACKGROUND_ALPHA;
    ctx.drawImage(bg, ...coverRect(bg, vp.width / vp.height), vp.left, vp.top, vp.width, vp.height);
    ctx.globalAlpha = 1;
  }

  const sample = createSampler(chart, t);
  const order = chart.lines
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => !hiddenLines?.has(line.id))
    .sort((a, b) => a.line.zOrder - b.line.zOrder || a.i - b.i);
  const highlight = highlightSimultaneous ? simultaneous(chart) : NO_IDS;

  const withLine = (state: Pick<LineState, 'x' | 'y' | 'rotation'>, draw: () => void) => {
    ctx.save();
    ctx.translate(cx + state.x * scaleX, cy - state.y * scale);
    ctx.rotate((state.rotation * Math.PI) / 180);
    draw();
    ctx.restore();
  };

  // Text and media; z order < 0 draws below lines.
  const texts = sampleTexts(chart, t, sample);
  const mediaItems = sampleMedia(chart, t, sample);
  const noise = chart.noiseFields.length
    ? sampleNoiseFields(chart, t, sample, selectedObjectId)
    : [];
  const vars = texts.length ? chartVariables(chart, t, info) : {};
  const drawShapeUI = (
    text: TextObject,
    state: ReturnType<typeof sampleTexts>[number]['state'],
  ) => {
    const alpha = Math.min(1, state.alpha / 255);
    if (alpha <= 0 || state.scaleX === 0 || state.scaleY === 0) return;
    const h = text.size * scale;
    const icon = text.builtin === 'pause' ? getImage('Pause') : null;
    const w =
      text.builtin === 'bar'
        ? CANVAS_WIDTH * scaleX
        : h * (icon ? icon.naturalWidth / icon.naturalHeight : 0.625);
    withLine(state, () => {
      ctx.scale(state.scaleX, state.scaleY);
      ctx.globalAlpha = alpha;
      const x = -text.anchor[0] * w;
      const y = -(1 - text.anchor[1]) * h;
      if (text.builtin === 'bar') {
        const progress = duration > 0 ? Math.min(1, Math.max(0, t / duration)) : 0;
        ctx.globalAlpha = alpha * BAR_ALPHA;
        ctx.fillStyle = toCss(state.color);
        ctx.fillRect(x, y, w * progress, h);
      } else if (icon) {
        const m = ctx.getTransform();
        const [pw, ph] = deviceSize(m, w, h);
        const img = frameFor(icon, icon.naturalWidth, icon.naturalHeight, pw, ph, state.color);
        ctx.drawImage(img, x, y, w, h);
      } else {
        ctx.fillStyle = toCss(state.color);
        ctx.fillRect(x, y, w * 0.35, h);
        ctx.fillRect(x + w * 0.65, y, w * 0.35, h);
      }
    });
  };
  const objects = [
    ...texts.map(({ text, state }) => ({
      z: text.zOrder,
      ui: !!text.builtin,
      draw: () => {
        if (text.builtin ? hideUI : hideText) return;
        if (text.builtin === 'pause' || text.builtin === 'bar') {
          drawShapeUI(text, state);
          return;
        }
        const scaled = text.alphaVar ? Number(vars[text.alphaVar] ?? 255) / 255 : 1;
        const alpha = Math.min(1, (state.alpha / 255) * scaled);
        const content = expandText(state.text, vars);
        if (!content || alpha <= 0 || state.scaleX === 0 || state.scaleY === 0) return;
        withLine(state, () => {
          const size = text.size * scale;
          ctx.scale(state.scaleX, state.scaleY);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = toCss(state.color);
          ctx.font = `${size}px ${fontFamily(state.font)}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const [ax, ay] = text.anchor;
          ctx.fillText(content, -ax * ctx.measureText(content).width, (ay - 0.5) * size);
        });
      },
    })),
    ...mediaItems.map(({ media, state }) => ({
      z: media.zOrder,
      ui: false,
      draw: () => {
        const loaded = getMedia(media.assetId);
        if (!loaded || !loaded.width) return;
        // Synced even when hidden so videos stay on time.
        const frame = mediaFrame(loaded, state.mediaTime, media.loop, playing, rate);
        const alpha = Math.min(1, state.alpha / 255);
        if (hideMedia || !frame || alpha <= 0 || state.scaleX === 0 || state.scaleY === 0) return;
        if (media.playingOnly && !isPlaying(state.mediaTime, loaded.duration, media.loop)) return;
        withLine(state, () => {
          const [w, h] = mediaSize(loaded, media.fit, vp, scale);
          ctx.scale(state.scaleX, state.scaleY);
          const x = -media.anchor[0] * w;
          const y = -(1 - media.anchor[1]) * h;
          const m = ctx.getTransform();
          if (offscreen(m, x, y, w, h, ctx.canvas)) return;
          ctx.globalAlpha = alpha;
          const [pw, ph] = deviceSize(m, w, h);
          const img = frameFor(
            frame,
            loaded.width,
            loaded.height,
            pw,
            ph,
            state.color,
            loaded.video,
          );
          ctx.drawImage(img, x, y, w, h);
        });
      },
    })),
  ].sort((a, b) => a.z - b.z);
  // Chart shaders run under the UI, so the UI draws after them.
  const uiLast = shaders.chart.length > 0;
  const inChart = (o: (typeof objects)[number]) => !(uiLast && o.ui);
  for (const o of objects) if (o.z < 0 && inChart(o)) o.draw();
  ctx.globalAlpha = 1;

  // Lines
  for (const { line, i } of order) {
    const s = sample(i);
    const selected = highlightSelected && line.id === selectedLineId;
    const alpha = Math.min(1, s.alpha / 255);
    if (alpha <= 0 || s.scaleX === 0 || s.scaleY === 0) continue;
    withLine(s, () => {
      ctx.scale(s.scaleX, s.scaleY);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = selected ? SELECTED_LINE_COLOR : toCss(s.color);
      const [ax, ay] = line.anchor;
      ctx.fillRect(
        -ax * LINE_WIDTH * scale,
        -(1 - ay) * LINE_HEIGHT * scale,
        LINE_WIDTH * scale,
        LINE_HEIGHT * scale,
      );
    });
  }

  // Notes: holds below other notes.
  for (const holds of [true, false]) {
    for (const { line, i } of order) {
      const s = sample(i);
      const runtime = lineRuntime(line, chart.bpmList);
      const radius = 1600 + Math.hypot(s.x, s.y);
      // Notes ending before t are never visible.
      const first = runtime.firstEndingFrom(t);
      if (first >= runtime.notes.length) continue;
      withLine(s, () => {
        for (let k = first; k < runtime.notes.length; k++) {
          const entry = runtime.notes[k];
          if ((entry.note.type === 'hold') !== holds || !isNoteVisible(entry, runtime, s, t))
            continue;
          drawNote(ctx, entry, s, t, scale, scaleX, radius, highlight.has(entry.note.id));
        }
      });
    }
  }

  // Noise fields above notes.
  if (!hideNoise && noise.length) {
    drawNoiseFields(
      ctx,
      noise,
      { cx, cy, scale, scaleX },
      highlightSelected ? selectedObjectId : null,
      noiseQuality === 'original' ? t : null,
    );
  }

  // Objects with z order >= 0 above notes.
  for (const o of objects) if (o.z >= 0 && inChart(o)) o.draw();
  ctx.globalAlpha = 1;

  // Hit effects
  if (Number.isFinite(effectsSince)) {
    const samplers = new Map<number, ReturnType<typeof createSampler>>();
    const sampleAt = (time: number) => {
      let s = samplers.get(time);
      if (!s) samplers.set(time, (s = createSampler(chart, time)));
      return s;
    };
    const from = Math.max(t - HIT_LIFETIME, effectsSince);
    for (const { line, i } of order) {
      const runtime = lineRuntime(line, chart.bpmList);
      // Hits need end > from and start <= t.
      for (let k = runtime.firstEndingFrom(from); k < runtime.notes.length; k++) {
        const entry = runtime.notes[k];
        if (runtime.sortedByStart && entry.start > t) break;
        if (entry.note.fake) continue;
        for (const time of hitTimes(entry, from, t)) {
          const s = sampleAt(time)(i);
          const n = noteState(entry, s, time);
          const a = (s.rotation * Math.PI) / 180;
          const nx = n.x * scaleX;
          const ny = n.y * scale;
          const x = cx + s.x * scaleX + nx * Math.cos(a) + ny * Math.sin(a);
          const y = cy - s.y * scale + nx * Math.sin(a) - ny * Math.cos(a);
          drawHit(ctx, x, y, t - time, scale, Math.round(time * 1000) + i * 65537);
        }
      }
    }
  }

  if (uiLast) {
    shade(ctx, vp, shaders.chart, t);
    for (const o of objects) if (o.ui) o.draw();
    ctx.globalAlpha = 1;
  }
  shade(ctx, vp, shaders.global, t);

  if (bearingMarker) {
    const lineIndex = chart.lines.findIndex((l) => l.id === selectedLineId);
    const target =
      lineIndex >= 0
        ? sample(lineIndex)
        : selectedObjectId
          ? [...texts, ...mediaItems, ...noise].find(
              (o) =>
                ('text' in o ? o.text : 'media' in o ? o.media : o.field).id === selectedObjectId,
            )?.state
          : undefined;
    if (target) withLine(target, () => drawBearing(ctx));
  }

  // Anchor & Center point marker for selected judgement line
  if (showAnchorMarker && selectedLineId) {
    const lineIndex = chart.lines.findIndex((l) => l.id === selectedLineId);
    if (lineIndex >= 0) {
      const line = chart.lines[lineIndex];
      const s = sample(lineIndex);
      if (s) {
        drawAnchorCenterMarker(ctx, line, s, scale, scaleX, cx, cy);
      }
    }
  }

  if (trajectoryGhost && Array.isArray(trajectoryGhost.points) && trajectoryGhost.points.length > 1) {
    try {
      const validPoints = trajectoryGhost.points.filter(
        (pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y),
      );
      if (validPoints.length > 1) {
        ctx.save();
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 6]);
        ctx.strokeStyle = '#38bdf8';
        ctx.beginPath();
        for (let k = 0; k < validPoints.length; k++) {
          const sx = cx + validPoints[k].x * scaleX;
          const sy = cy - validPoints[k].y * scale;
          if (k === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Start marker (green dot)
        const s0x = cx + validPoints[0].x * scaleX;
        const s0y = cy - validPoints[0].y * scale;
        if (Number.isFinite(s0x) && Number.isFinite(s0y)) {
          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(s0x, s0y, 5, 0, Math.PI * 2);
          ctx.fill();
        }

        // End marker (rose dot)
        const lastPt = validPoints[validPoints.length - 1];
        const enx = cx + lastPt.x * scaleX;
        const eny = cy - lastPt.y * scale;
        if (Number.isFinite(enx) && Number.isFinite(eny)) {
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.arc(enx, eny, 5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    } catch (err) {
      console.warn('Trajectory ghost render error:', err);
    }
  }

  if (textFittingGhost && Array.isArray(textFittingGhost.notes) && textFittingGhost.notes.length > 0) {
    try {
      ctx.save();
      for (const n of textFittingGhost.notes) {
        if (!n || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
        const sx = cx + n.x * scaleX;
        const sy = cy - n.y * scale;
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

        const color =
          n.type === 'drag'
            ? '#facc15'
            : n.type === 'flick'
              ? '#f43f5e'
              : '#38bdf8';

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.5 * scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1 * scale;
        ctx.stroke();
      }
      ctx.restore();
    } catch (err) {
      console.warn('TextFitting ghost render error:', err);
    }
  }

  if (curveFillGhost && Array.isArray(curveFillGhost.notes) && curveFillGhost.notes.length > 0) {
    try {
      ctx.save();
      // Draw smooth curve polyline if pathPoints exist
      if (curveFillGhost.pathPoints && curveFillGhost.pathPoints.length > 1) {
        ctx.beginPath();
        let started = false;
        for (const pt of curveFillGhost.pathPoints) {
          if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
          const sx = cx + pt.x * scaleX;
          const sy = cy - pt.y * scale;
          if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
          if (!started) {
            ctx.moveTo(sx, sy);
            started = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        }
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 2 * scale;
        ctx.setLineDash([4 * scale, 3 * scale]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw ghost note markers
      for (const n of curveFillGhost.notes) {
        if (!n || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
        const sx = cx + n.x * scaleX;
        const sy = cy - n.y * scale;
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

        const color =
          n.type === 'drag'
            ? '#facc15'
            : n.type === 'flick'
              ? '#f43f5e'
              : n.type === 'hold'
                ? '#c084fc'
                : '#38bdf8';

        // Outer glow/halo
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sx, sy, 5 * scale, 0, Math.PI * 2);
        ctx.fill();

        // Core note dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.5 * scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 1 * scale;
        ctx.stroke();
      }
      ctx.restore();
    } catch (err) {
      console.warn('CurveFill ghost render error:', err);
    }
  }

  ctx.restore();

  if (overflowPreview && fov <= 1) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    if (vp.left > 0) ctx.fillRect(0, 0, vp.left, height);
    if (vp.left + vp.width < width) ctx.fillRect(vp.left + vp.width, 0, width - (vp.left + vp.width), height);
    if (vp.top > 0) ctx.fillRect(vp.left, 0, vp.width, vp.top);
    if (vp.top + vp.height < height) ctx.fillRect(vp.left, vp.top + vp.height, vp.width, height - (vp.top + vp.height));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vp.left + 0.5, vp.top + 0.5, vp.width, vp.height);
    ctx.restore();
  } else if (fov > 1) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vp.left + 0.5, vp.top + 0.5, vp.width, vp.height);
  }
}

const isPlaying = (time: number | null, duration: number, loop: boolean) =>
  time !== null && time >= 0 && (loop || duration <= 0 || time < duration);

// Draw size in pixels: RPE texture size (1 pixel = 1 canvas unit) or fitted to the play frame.
function mediaSize(
  media: { width: number; height: number },
  fit: MediaFit | undefined,
  vp: ReturnType<typeof previewViewport>,
  scale: number,
): [number, number] {
  if (!fit || fit === 'none') return [media.width * scale, media.height * scale];
  if (fit === 'stretch') return [vp.width, vp.height];
  const pick = fit === 'cover' ? Math.max : Math.min;
  const k = pick(vp.width / media.width, vp.height / media.height);
  return [media.width * k, media.height * k];
}

// Runs shaders over the play frame (device pixels).
function shade(
  ctx: CanvasRenderingContext2D,
  vp: ReturnType<typeof previewViewport>,
  passes: ShaderPass[],
  t: number,
) {
  if (!passes.length) return;
  const dpr = ctx.getTransform().a;
  const x = Math.max(0, vp.left * dpr);
  const y = Math.max(0, vp.top * dpr);
  const w = Math.min(ctx.canvas.width, (vp.left + vp.width) * dpr) - x;
  const h = Math.min(ctx.canvas.height, (vp.top + vp.height) * dpr) - y;
  applyShaders(ctx.canvas, { x, y, w, h }, passes, t);
}

// Size in device pixels of a w x h rect under m.
const deviceSize = (m: DOMMatrix, w: number, h: number) =>
  [Math.abs(w) * Math.hypot(m.a, m.b), Math.abs(h) * Math.hypot(m.c, m.d)] as const;

// True when the rect under m lies fully outside the canvas.
function offscreen(
  m: DOMMatrix,
  x: number,
  y: number,
  w: number,
  h: number,
  canvas: HTMLCanvasElement,
) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let k = 0; k < 4; k++) {
    const px = x + (k & 1 ? w : 0);
    const py = y + (k & 2 ? h : 0);
    const dx = m.a * px + m.c * py + m.e;
    const dy = m.b * px + m.d * py + m.f;
    minX = Math.min(minX, dx);
    maxX = Math.max(maxX, dx);
    minY = Math.min(minY, dy);
    maxY = Math.max(maxY, dy);
  }
  return maxX < 0 || maxY < 0 || minX > canvas.width || minY > canvas.height;
}

function hitTimes(entry: NoteEntry, from: number, to: number): number[] {
  if (entry.note.type !== 'hold')
    return entry.start > from && entry.start <= to ? [entry.start] : [];
  const times: number[] = [];
  const first = Math.max(0, Math.ceil((from - entry.start) / HOLD_HIT_INTERVAL));
  for (let k = first; ; k++) {
    const time = entry.start + k * HOLD_HIT_INTERVAL;
    if (time > to || time >= entry.end) break;
    if (time > from) times.push(time);
  }
  return times;
}

function drawNote(
  ctx: CanvasRenderingContext2D,
  entry: NoteEntry,
  line: LineState,
  t: number,
  scale: number,
  scaleX: number,
  radius: number,
  highlight: boolean,
) {
  const n = noteState(entry, line, t);
  if (n.alpha <= 0 || n.size === 0) return;
  if (Math.abs(n.y) > radius && Math.abs(n.tail) > radius) return;
  const width = NOTE_WIDTH * scale * n.size;
  const x = n.x * scaleX;
  const head = -n.y * scale;
  ctx.globalAlpha = Math.min(1, n.alpha);

  if (entry.note.type === 'hold') {
    drawHold(ctx, x, head, -n.tail * scale, width, highlight, n.showHead, entry.note.tint);
  } else if (n.showHead) {
    const img = headImage(entry.note.type, highlight, entry.note.tint);
    if (img) {
      const h = Math.max(5, (width * img.height) / img.width);
      ctx.drawImage(img, x - width / 2, head - h / 2, width, h);
    } else {
      ctx.fillStyle = entry.note.tint ? toCss(entry.note.tint) : FALLBACK_COLORS[entry.note.type];
      ctx.fillRect(x - width / 2, head - 2, width, 4);
    }
  }
  ctx.globalAlpha = 1;
}

function drawHold(
  ctx: CanvasRenderingContext2D,
  x: number,
  head: number,
  tail: number,
  width: number,
  highlight: boolean,
  showHead: boolean,
  tint?: Color,
) {
  const { body, end, head: headImg } = holdImages(highlight, tint);
  const length = Math.abs(tail - head);
  if (!body) {
    ctx.fillStyle = tint ? toCss(tint) : FALLBACK_COLORS.hold;
    ctx.globalAlpha *= 0.55;
    ctx.fillRect(x - width / 2, Math.min(head, tail), width, length);
    return;
  }
  const unit = width / body.width;
  ctx.save();
  ctx.translate(x, head);
  ctx.scale(1, tail <= head ? 1 : -1);
  ctx.drawImage(body, -width / 2, -length, width, Math.max(1, length));
  if (end) {
    const w = end.width * unit;
    const h = end.height * unit;
    ctx.drawImage(end, -w / 2, -length - h, w, h);
  }
  if (showHead && headImg) {
    const w = headImg.width * unit;
    ctx.drawImage(headImg, -w / 2, 0, w, headImg.height * unit);
  }
  ctx.restore();
}

function drawHit(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  age: number,
  scale: number,
  seed: number,
) {
  if (age < 0) return;
  const frame =
    age < HIT_DURATION ? Math.min(HIT_FRAMES, Math.floor(age / HIT_FRAME_SECONDS) + 1) : 0;
  const img = frame ? (tinted(`img-${frame}`, HIT_COLOR) ?? getImage(`img-${frame}`)) : null;
  const size = HIT_SIZE * scale;
  if (img) ctx.drawImage(img, x - size / 2, y - size / 2, size, size);

  // Particles
  if (age >= 2 / 3) return;
  const amount = ease({ kind: 'preset', id: 16 }, age * 1.5);
  const noteSize = NOTE_WIDTH * scale;
  ctx.fillStyle = `rgb(${HIT_COLOR.join(',')})`;
  ctx.globalAlpha = Math.max(0, 1 - age * 1.5);
  for (let k = 0; k < 4; k++) {
    const r = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    const angle = (r - Math.floor(r)) * Math.PI * 2;
    const d = noteSize * 1.1 * amount;
    const half = noteSize * 0.075 * amount;
    ctx.fillRect(
      x + Math.cos(angle) * d - half,
      y + Math.sin(angle) * d - half,
      half * 2,
      half * 2,
    );
  }
  ctx.globalAlpha = 1;
}

// Ring at the origin with an arrow toward the object's local up.
function drawBearing(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.lineJoin = 'round';
  const path = () => {
    ctx.beginPath();
    ctx.arc(0, 0, BEARING_RADIUS, 0, Math.PI * 2);
    ctx.moveTo(0, -BEARING_RADIUS);
    ctx.lineTo(0, -BEARING_LENGTH);
    ctx.moveTo(-6, -BEARING_LENGTH + 7);
    ctx.lineTo(0, -BEARING_LENGTH);
    ctx.lineTo(6, -BEARING_LENGTH + 7);
  };
  path();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.lineWidth = 5;
  ctx.stroke();
  path();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Anchor and center point marker for the selected judgement line.
function drawAnchorCenterMarker(
  ctx: CanvasRenderingContext2D,
  line: JudgeLine,
  state: LineState,
  scale: number,
  scaleX: number,
  cx: number,
  cy: number,
) {
  const sx = cx + state.x * scaleX;
  const sy = cy - state.y * scale;
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;

  const rawRot = state.rotation;
  const isRotated = Math.abs(rawRot % 360) > 0.05;

  ctx.save();

  // 1. World-space rotation arc & angle readout if line is rotated
  if (isRotated) {
    ctx.save();
    ctx.translate(sx, sy);

    const rad = (-rawRot * Math.PI) / 180; // Inverted for canvas screen Y
    const arcRadius = 26;

    // Faint horizontal 0-degree baseline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(arcRadius + 12, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Glowing angle arc
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const anticlockwise = rad < 0;
    ctx.arc(0, 0, arcRadius, 0, rad, anticlockwise);
    ctx.stroke();

    // Small angle badge
    const midAngle = rad / 2;
    const badgeR = arcRadius + 14;
    const bx = Math.cos(midAngle) * badgeR;
    const by = Math.sin(midAngle) * badgeR;
    const label = `${Math.round(rawRot * 10) / 10}°`;

    ctx.font = '10px monospace';
    const textW = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(bx - textW / 2 - 3, by - 7, textW + 6, 14);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - textW / 2 - 3, by - 7, textW + 6, 14);

    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx, by);

    ctx.restore();
  }

  // 2. Line-space anchor point and geometric center marker
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate((rawRot * Math.PI) / 180);

  const [ax, ay] = line.anchor;
  const isOffsetAnchor = Math.abs(ax - 0.5) > 0.005 || Math.abs(ay - 0.5) > 0.005;

  // If anchor is offset, draw guide line to geometric line center
  if (isOffsetAnchor) {
    const centerOffsetX = (0.5 - ax) * LINE_WIDTH * scale;
    // Draw dashed connecting line between Anchor and Center
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(centerOffsetX, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Diamond marker at geometric center
    ctx.save();
    ctx.translate(centerOffsetX, 0);
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(6, 0);
    ctx.lineTo(0, 6);
    ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Center text tag
    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'center';
    ctx.fillText('Center', 0, 15);
    ctx.restore();
  }

  // Anchor Pivot Crosshair at (0, 0)
  // Contrast shadow outline
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  // Circle
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  // Crosshair ticks
  ctx.moveTo(-16, 0); ctx.lineTo(-8, 0);
  ctx.moveTo(8, 0); ctx.lineTo(16, 0);
  ctx.moveTo(0, 8); ctx.lineTo(0, 13);
  ctx.moveTo(0, -8); ctx.lineTo(0, -18);
  // Arrow head pointing in -Y (Above)
  ctx.moveTo(-4, -13); ctx.lineTo(0, -18); ctx.lineTo(4, -13);
  ctx.stroke();

  // Vibrant foreground lines
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  // Circle
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  // Crosshair ticks
  ctx.moveTo(-15, 0); ctx.lineTo(-8, 0);
  ctx.moveTo(8, 0); ctx.lineTo(15, 0);
  ctx.moveTo(0, 8); ctx.lineTo(0, 12);
  ctx.moveTo(0, -8); ctx.lineTo(0, -17);
  // Arrow head pointing in -Y (Above)
  ctx.moveTo(-3.5, -13); ctx.lineTo(0, -17); ctx.lineTo(3.5, -13);
  ctx.stroke();

  // Solid white core dot
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // If offset anchor, add small "Pivot" label
  if (isOffsetAnchor) {
    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText('Pivot', 0, 22);
  }

  ctx.restore();
  ctx.restore();
}
