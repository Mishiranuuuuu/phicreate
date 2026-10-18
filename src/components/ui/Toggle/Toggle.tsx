import { useId } from 'react';
import { FieldLabel } from '../FieldLabel/FieldLabel';
import styles from './Toggle.module.css';

interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  const id = useId();
  return (
    <div className={styles.row}>
      <FieldLabel htmlFor={id} label={label} hint={hint} />
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={styles.track}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.thumb} />
      </button>
    </div>
  );
}
