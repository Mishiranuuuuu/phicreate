import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './SidePanel.module.css';

export function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <h2>{title}</h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function Row({
  label,
  onScrub,
  scrubStep = 1,
  title,
  children,
}: {
  label: string;
  onScrub?: (delta: number, isFinal: boolean) => void;
  scrubStep?: number;
  title?: string;
  children: ReactNode;
}) {
  const [scrubbing, setScrubbing] = useState(false);
  const onScrubRef = useRef(onScrub);
  onScrubRef.current = onScrub;

  const handlePointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!onScrubRef.current || e.button !== 0) return;
    e.preventDefault();
    const target = e.currentTarget;
    try {
      target.requestPointerLock?.();
    } catch {}
    setScrubbing(true);
    let totalDelta = 0;
    let cancelled = false;

    const onMove = (ev: MouseEvent) => {
      if (cancelled || !onScrubRef.current) return;
      const mx = ev.movementX ?? 0;
      if (mx === 0) return;
      let mult = 1;
      if (ev.shiftKey) mult = 10;
      else if (ev.altKey) mult = 0.1;
      const d = mx * scrubStep * mult;
      totalDelta += d;
      onScrubRef.current(d, false);
    };

    const onKeyDown = (ke: KeyboardEvent) => {
      if (ke.key === 'Escape') {
        cancelled = true;
        try {
          document.exitPointerLock?.();
        } catch {}
        cleanup();
        setScrubbing(false);
        onScrubRef.current?.(-totalDelta, true);
      }
    };

    const onUp = () => {
      try {
        document.exitPointerLock?.();
      } catch {}
      cleanup();
      setScrubbing(false);
      if (!cancelled && onScrubRef.current) {
        onScrubRef.current(0, true);
      }
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKeyDown);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKeyDown);
  };

  return (
    <label className={styles.row}>
      <span
        className={onScrub ? (scrubbing ? styles.scrubbing : styles.scrubbable) : undefined}
        title={
          onScrub
            ? (title ?? `${label}: Drag horizontally to scrub value (Shift: 10×, Alt: 0.1×, Esc: cancel)`)
            : title
        }
        onPointerDown={onScrub ? handlePointerDown : undefined}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={styles.row}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

// Native picker; commits once when the picker closes, not on every drag. Remount (key) to reset.
export function ColorPicker({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (hex: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  useEffect(() => {
    const el = ref.current!;
    const onChange = () => commitRef.current(el.value);
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, []);
  return <input ref={ref} type="color" defaultValue={value} />;
}
