import { useId } from 'react';
import textStyles from '../TextField/TextField.module.css';
import styles from './FileField.module.css';

interface FileFieldProps {
  label: string;
  accept: string;
  file: File | null;
  hint?: string;
  onChange: (file: File | null) => void;
}

export function FileField({ label, accept, file, hint, onChange }: FileFieldProps) {
  const id = useId();
  const note = file ? file.name : hint;
  return (
    <div className={textStyles.field}>
      <label htmlFor={id} className={textStyles.label}>
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        className={styles.input}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {note && <span className={textStyles.hint}>{note}</span>}
    </div>
  );
}
