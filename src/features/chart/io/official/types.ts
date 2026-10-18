// Official Phigros chart JSON. See https://teamflos.github.io/phira-docs/chart-standard/chart-format/phi/root.html

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../model/defaults';

// Frame fraction (0-1, origin bottom-left) to canvas units (origin center).
export const toX = (v: number) => (v - 0.5) * CANVAS_WIDTH;
export const toY = (v: number) => (v - 0.5) * CANVAS_HEIGHT;
export const fromX = (v: number) => v / CANVAS_WIDTH + 0.5;
export const fromY = (v: number) => v / CANVAS_HEIGHT + 0.5;

// Line times are in 1.875 / bpm seconds (128th notes).
export interface OfficialEvent {
  startTime: number;
  endTime: number;
  start: number;
  end: number;
  // Move y (formatVersion 3).
  start2?: number;
  end2?: number;
}

export interface OfficialSpeedEvent {
  startTime: number;
  endTime: number;
  value: number;
  floorPosition?: number;
}

export interface OfficialNote {
  type: number; // 1 tap, 2 drag, 3 hold, 4 flick
  time: number;
  holdTime?: number;
  positionX?: number;
  speed?: number;
  floorPosition?: number;
}

export interface OfficialLine {
  bpm: number;
  notesAbove?: OfficialNote[];
  notesBelow?: OfficialNote[];
  speedEvents?: OfficialSpeedEvent[];
  judgeLineMoveEvents?: OfficialEvent[];
  judgeLineRotateEvents?: OfficialEvent[];
  judgeLineDisappearEvents?: OfficialEvent[];
  numOfNotes?: number;
  numOfNotesAbove?: number;
  numOfNotesBelow?: number;
}

// Normalized to the play frame, origin bottom-left.
export interface OfficialPoint {
  x: number;
  y: number;
}

// Block area events are keyframes in seconds; each eases from the previous one.
export interface OfficialBlockMoveEvent {
  time: number;
  endPosition: OfficialPoint;
  easeTypeX?: number;
  easeTypeY?: number;
}

export interface OfficialBlockRotateEvent {
  time: number;
  rotation: number;
  anchor?: OfficialPoint;
  easeType?: number;
}

export interface OfficialBlockScaleEvent {
  time: number;
  scale: OfficialPoint;
  anchor?: OfficialPoint;
  easeTypeX?: number;
  easeTypeY?: number;
}

export interface OfficialBlockArea {
  topRightPercentage?: OfficialPoint;
  bottomLeftPercentage?: OfficialPoint;
  appearTime?: number;
  enableTime?: number;
  disableTime?: number;
  disappearTime?: number;
  isSubtract?: boolean;
  moveEvents?: OfficialBlockMoveEvent[];
  rotateEvents?: OfficialBlockRotateEvent[];
  scaleEvents?: OfficialBlockScaleEvent[];
}

export interface OfficialChart {
  formatVersion: number;
  offset?: number;
  judgeLineList: OfficialLine[];
  blockAreaList?: OfficialBlockArea[];
}

export function isOfficialChart(data: unknown): data is OfficialChart {
  const chart = data as OfficialChart;
  const first = chart?.judgeLineList?.[0];
  return (
    typeof chart?.formatVersion === 'number' &&
    Array.isArray(chart.judgeLineList) &&
    typeof first?.bpm === 'number' &&
    Array.isArray(first.judgeLineMoveEvents)
  );
}
