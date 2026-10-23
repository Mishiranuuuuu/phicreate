import type { NoteType } from '@/features/chart/model/types';

export type TextFittingMode = 'skeleton' | 'contour' | 'fill';

export type TimingDistributionMode =
  | 'simultaneous'
  | 'leftToRight'
  | 'topToBottom'
  | 'strokeOrder'
  | 'random';

export interface TextFittingOptions {
  text: string;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  mode: TextFittingMode;
  spacing: number; // Target distance between sampled notes in canvas units
  targetWidth: number; // Width in canvas units
  centerX: number; // -675..675
  centerY: number; // -450..450
  rotation: number; // degrees
  noteType: NoteType; // 'drag' | 'tap' | 'flick'
  noteSize: number; // 0.4..2.0
  speed: number; // 0.1..5.0
  above: boolean;
  fake: boolean; // true = decorative (doesn't count towards combo/score)
  alignToLine: boolean;
  targetLineId: string | null;
  timingMode: TimingDistributionMode;
  startBeat: number;
  endBeat: number;
}

export interface FittedNotePoint {
  x: number;
  y: number;
  beat: number;
  order: number;
}

export interface TextFittingGhost {
  notes: { x: number; y: number; type: NoteType }[];
}
