import { useId } from 'react';
import { FieldLabel } from '../FieldLabel/FieldLabel';
import styles from './Slider.module.css';

interface SliderProps {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}

export function Slider({
  label,
  hint,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  format = String,
  onChange,
}: SliderProps) {
  const id = useId();
  return (
    <div className={styles.row}>
      <FieldLabel htmlFor={id} label={label} hint={hint} />
      <div className={styles.control}>
        <input
          id={id}
          type="range"
          className={styles.range}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className={styles.value}>{format(value)}</span>
      </div>
    </div>
  );
}
