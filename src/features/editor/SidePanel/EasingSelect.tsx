import { EASING_NAMES } from '@/features/chart/model/easing';

interface EasingSelectProps {
  // RPE preset id; undefined = mixed selection.
  value: number | undefined;
  onChange: (id: number) => void;
  extra?: string;
}

export function EasingSelect({ value, onChange, extra }: EasingSelectProps) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))}>
      {value === undefined && <option value="">{extra ?? '—'}</option>}
      {EASING_NAMES.map((name, i) => (
        <option key={name} value={i + 1}>
          {i + 1}. {name}
        </option>
      ))}
    </select>
  );
}
