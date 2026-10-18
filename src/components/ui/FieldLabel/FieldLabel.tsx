import styles from './FieldLabel.module.css';

interface FieldLabelProps {
  htmlFor?: string;
  label: string;
  hint?: string;
}

// Label with an optional muted hint, for inline (row) controls.
export function FieldLabel({ htmlFor, label, hint }: FieldLabelProps) {
  return (
    <div className={styles.text}>
      <label htmlFor={htmlFor}>{label}</label>
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}
