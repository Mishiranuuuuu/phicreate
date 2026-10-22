import { EASING_NAMES } from '@/features/chart/model/easing';

interface EasingSelectProps {
  // RPE preset id; undefined = mixed selection or Bézier.
  value: number | undefined;
  disabled?: boolean;
  onChange: (id: number) => void;
}

export function EasingSelect({ value, disabled, onChange }: EasingSelectProps) {
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {value === undefined && <option value="">—</option>}
      {EASING_NAMES.map((name, i) => (
        <option key={name} value={i + 1}>
          {i + 1}. {name}
        </option>
      ))}
    </select>
  );
}
