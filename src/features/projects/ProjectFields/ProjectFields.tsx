import type { ReactNode } from 'react';
import { FileField, TextField } from '@/components/ui';
import type { ProjectFormValues } from '../types';
import styles from './ProjectFields.module.css';

interface ProjectFieldsProps<T extends ProjectFormValues> {
  form: T;
  set: <K extends keyof T>(key: K, value: T[K]) => void;
  // Shown beside BPM.
  extra?: ReactNode;
  hasAudio?: boolean;
  hasIllustration?: boolean;
}

export function ProjectFields<T extends ProjectFormValues>({
  form,
  set: setField,
  extra,
  hasAudio,
  hasIllustration,
}: ProjectFieldsProps<T>) {
  const set = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) =>
    setField(key, value as T[K]);
  return (
    <>
      <TextField
        label="Name"
        value={form.name}
        onChange={(e) => set('name', e.target.value)}
        autoFocus
        required
      />
      <TextField
        label="Artist"
        value={form.artist}
        onChange={(e) => set('artist', e.target.value)}
      />
      <TextField
        label="Illustrator"
        value={form.illustrator}
        onChange={(e) => set('illustrator', e.target.value)}
      />
      <TextField
        label="Charter"
        value={form.charter}
        onChange={(e) => set('charter', e.target.value)}
      />
      <TextField
        label="Difficulty"
        placeholder="e.g. IN Lv.15"
        value={form.difficulty}
        onChange={(e) => set('difficulty', e.target.value)}
      />
      <div className={styles.row}>
        <TextField
          label="Song BPM"
          type="number"
          min={1}
          step="any"
          value={form.bpm}
          onChange={(e) => set('bpm', Number(e.target.value) || 120)}
        />
        {extra}
      </div>
      <FileField
        label="Import audio"
        accept="audio/*"
        file={(form.audio as File | undefined) ?? null}
        hint={hasAudio ? 'Saved audio is kept unless replaced' : undefined}
        onChange={(f) => set('audio', f ?? undefined)}
      />
      <FileField
        label="Import illustration"
        accept="image/*"
        file={(form.illustration as File | undefined) ?? null}
        hint={hasIllustration ? 'Saved illustration is kept unless replaced' : undefined}
        onChange={(f) => set('illustration', f ?? undefined)}
      />
    </>
  );
}
