import { useId } from 'react';
import { FieldLabel } from '../FieldLabel/FieldLabel';
import styles from './Segmented.module.css';

interface SegmentedProps<T extends string> {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  const id = useId();
  return (
    <div className={styles.row}>
      <FieldLabel htmlFor={id} label={label} hint={hint} />
      <div id={id} role="radiogroup" aria-label={label} className={styles.group}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={styles.option}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
