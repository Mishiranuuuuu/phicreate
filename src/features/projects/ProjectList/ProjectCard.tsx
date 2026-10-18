import { MusicIcon } from '@/components/ui';
import { timeAgo } from '@/lib/time';
import type { ProjectMeta } from '../types';
import styles from './ProjectCard.module.css';

interface ProjectCardProps {
  project: ProjectMeta;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}

export function ProjectCard({ project, selected, onSelect, onOpen }: ProjectCardProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={styles.card}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && selected && onOpen()}
    >
      <span className={styles.thumb}>
        <MusicIcon width={20} height={20} />
      </span>
      <span className={styles.info}>
        <span className={styles.title}>
          <span className={styles.name}>{project.name}</span>
          {project.difficulty && <span className={styles.difficulty}>{project.difficulty}</span>}
        </span>
        <span className={styles.subtitle}>
          {project.artist ? (
            <>
              <span className={styles.label}>Artist: </span>
              <strong className={styles.value}>{project.artist}</strong>
            </>
          ) : (
            'No artist set'
          )}
        </span>
      </span>
      <span className={styles.meta}>
        {project.charter && (
          <span>
            <span className={styles.label}>Chart: </span>
            <strong className={styles.value}>{project.charter}</strong>
          </span>
        )}
        <span>Edited {timeAgo(project.updatedAt)}</span>
      </span>
    </button>
  );
}
