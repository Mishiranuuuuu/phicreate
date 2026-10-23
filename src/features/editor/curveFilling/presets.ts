// Mathematical presets for Curve Note Filling.

import type { MathPresetId } from './types';

export interface MathPresetMeta {
  id: MathPresetId;
  name: string;
  category: string;
  description: string;
  defaultAmp: number;
  defaultCycles: number;
  defaultPhase: number;
}

export const MATH_PRESETS: MathPresetMeta[] = [
  {
    id: 'sine',
    name: 'Sine Wave',
    category: 'Waves',
    description: 'Smooth harmonic sine wave oscillation around center X.',
    defaultAmp: 250,
    defaultCycles: 2,
    defaultPhase: 0,
  },
  {
    id: 'cosine',
    name: 'Cosine Wave',
    category: 'Waves',
    description: 'Harmonic cosine wave starting at peak amplitude.',
    defaultAmp: 250,
    defaultCycles: 2,
    defaultPhase: 0,
  },
  {
    id: 'zigzag',
    name: 'Zigzag / Triangle',
    category: 'Waves',
    description: 'Linear zigzag ramps with crisp alternating peaks and troughs.',
    defaultAmp: 250,
    defaultCycles: 2,
    defaultPhase: 0,
  },
  {
    id: 'parabola',
    name: 'Parabola Arc',
    category: 'Arches',
    description: 'Sweeping arch throwing notes across the line and returning.',
    defaultAmp: 350,
    defaultCycles: 1,
    defaultPhase: 0,
  },
  {
    id: 'sigmoid',
    name: 'S-Curve (Sigmoid)',
    category: 'Transitions',
    description: 'Smooth S-curve lane transition between negative and positive amplitudes.',
    defaultAmp: 300,
    defaultCycles: 1,
    defaultPhase: 0,
  },
  {
    id: 'rebound',
    name: 'Multi-Rebound',
    category: 'Arches',
    description: 'Bouncing note stream bouncing repeatedly off the line center.',
    defaultAmp: 300,
    defaultCycles: 3,
    defaultPhase: 0,
  },
  {
    id: 'damped',
    name: 'Damped Wave (Spiral)',
    category: 'Decay',
    description: 'Wave that starts wide and smoothly converges toward the center.',
    defaultAmp: 350,
    defaultCycles: 3,
    defaultPhase: 0,
  },
  {
    id: 'custom',
    name: 'Custom Formula',
    category: 'Custom',
    description: 'Arbitrary mathematical expression x(t) evaluated across the beat range.',
    defaultAmp: 250,
    defaultCycles: 2,
    defaultPhase: 0,
  },
];
