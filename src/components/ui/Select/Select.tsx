import { useId } from 'react';
import { FieldLabel } from '../FieldLabel/FieldLabel';
import styles from './Select.module.css';

interface SelectProps<T extends string> {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function Select<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: SelectProps<T>) {
  const id = useId();
  return (
    <div className={styles.row}>
      <FieldLabel htmlFor={id} label={label} hint={hint} />
      <select
        id={id}
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
