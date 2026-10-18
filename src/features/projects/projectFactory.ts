import { createId } from '@/lib/id';
import { createChart } from '@/features/chart/model/defaults';
import { migrateChart } from '@/features/chart/io/migrations';
import {
  PROJECT_SCHEMA_VERSION,
  type NewProjectInput,
  type Project,
  type ProjectExport,
} from './types';

export function createProject(input: NewProjectInput): Project {
  const now = Date.now();
  return {
    meta: {
      id: createId(),
      name: input.name.trim() || 'Untitled',
      songName: input.name.trim(),
      artist: input.artist.trim(),
      illustrator: input.illustrator.trim(),
      charter: input.charter.trim(),
      difficulty: input.difficulty.trim(),
      createdAt: now,
      updatedAt: now,
      schemaVersion: PROJECT_SCHEMA_VERSION,
    },
    chart: createChart(input.bpm, input.lines),
    audio: input.audio,
    illustration: input.illustration,
  };
}

export function toExport(project: Project): ProjectExport {
  return {
    format: 'phicreate-project',
    version: PROJECT_SCHEMA_VERSION,
    meta: project.meta,
    chart: project.chart,
  };
}

// Returns a fresh project (new id) or null if invalid.
export function fromExport(data: unknown): Project | null {
  const d = data as Partial<ProjectExport> | null;
  if (!d || d.format !== 'phicreate-project' || !d.meta || !d.chart) return null;
  const now = Date.now();
  return {
    meta: {
      ...d.meta,
      illustrator: d.meta.illustrator ?? '',
      difficulty: d.meta.difficulty ?? '',
      id: createId(),
      updatedAt: now,
    },
    chart: migrateChart(d.chart),
  };
}
