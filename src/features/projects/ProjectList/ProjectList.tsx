import type { ProjectMeta } from '../types';
import { ProjectCard } from './ProjectCard';
import styles from './ProjectList.module.css';

interface ProjectListProps {
  projects: ProjectMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

export function ProjectList({ projects, selectedId, onSelect, onOpen }: ProjectListProps) {
  return (
    <ul className={styles.list} role="listbox" aria-label="Projects">
      {projects.map((p) => (
        <li key={p.id}>
          <ProjectCard
            project={p}
            selected={p.id === selectedId}
            onSelect={() => onSelect(p.id)}
            onOpen={() => onOpen(p.id)}
          />
        </li>
      ))}
    </ul>
  );
}
