import { useEffect, useState } from 'react';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import { projectRepo } from '@/features/projects/projectRepo';
import type { ProjectMeta } from '@/features/projects/types';
import { useProjectStore, type MetaPatch } from '@/features/projects/useProjectStore';
import { CommitInput } from '../CommitInput';
import { useEditorStore } from '../useEditorStore';
import { Row } from './fields';
import styles from './SidePanel.module.css';

const FIELDS: { key: keyof MetaPatch; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'artist', label: 'Artist' },
  { key: 'illustrator', label: 'Illustrator' },
  { key: 'charter', label: 'Charter' },
  { key: 'difficulty', label: 'Difficulty' },
];

export function MetadataPanel() {
  const projectId = useChartStore((s) => s.projectId);
  const [meta, setMeta] = useState<ProjectMeta | null>(null);

  useEffect(() => {
    if (projectId) void projectRepo.getMeta(projectId).then((m) => setMeta(m ?? null));
  }, [projectId]);

  if (!projectId || !meta) return <p className={styles.muted}>Loading…</p>;

  const commit = (key: keyof MetaPatch, text: string) => {
    const value = text.trim();
    if (key === 'name' && !value) return false;
    void useProjectStore
      .getState()
      .patchMeta(projectId, { [key]: value })
      .then((next) => {
        if (!next) return;
        setMeta(next);
        useEditorStore.getState().set({ projectName: next.name, difficulty: next.difficulty });
      });
  };

  return (
    <div className={styles.props}>
      {FIELDS.map(({ key, label }) => (
        <Row key={key} label={label}>
          <CommitInput value={meta[key]} onCommit={(text) => commit(key, text)} />
        </Row>
      ))}
    </div>
  );
}
