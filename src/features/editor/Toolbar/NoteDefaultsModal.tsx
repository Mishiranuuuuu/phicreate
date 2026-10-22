import { useEffect, useState } from 'react';
import { Button, Modal, Select, TextField, Toggle } from '@/components/ui';
import { parseNumber } from '@/lib/number';
import { useEditorStore } from '../useEditorStore';
import type { NoteDefaults } from '../types';
import styles from './NoteDefaultsModal.module.css';

type NumKey = 'speed' | 'alpha' | 'size' | 'yOffset';

const NUMBER_FIELDS: { key: NumKey; label: string; min: number; max?: number }[] = [
  { key: 'speed', label: 'Speed', min: 0 },
  { key: 'alpha', label: 'Alpha (0–255)', min: 0, max: 255 },
  { key: 'size', label: 'Size', min: 0 },
  { key: 'yOffset', label: 'Y offset', min: -Infinity },
];

const SIDE_OPTIONS = [
  { value: 'above', label: 'Above' },
  { value: 'below', label: 'Below' },
];

const INITIAL: NoteDefaults = {
  speed: 1,
  alpha: 255,
  size: 1,
  yOffset: 0,
  visibleTime: Infinity,
  above: true,
  fake: false,
};

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max?: number;
  onCommit: (v: number) => void;
}

function NumberField({ label, value, min, max = Infinity, onCommit }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const v = parseNumber(draft);
    if (v === null || v < min || v > max) return setDraft(String(value));
    onCommit(v);
  };

  return (
    <TextField
      label={label}
      value={draft}
      inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

function VisibleTimeField({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (v: number) => void;
}) {
  const format = (v: number) => (Number.isFinite(v) ? String(v) : '');
  const [draft, setDraft] = useState(format(value));
  useEffect(() => setDraft(format(value)), [value]);

  const commit = () => {
    const s = draft.trim();
    if (!s || s === '∞') {
      onCommit(Infinity);
      return;
    }
    const v = parseNumber(s);
    if (v === null || v < 0) return setDraft(format(value));
    onCommit(v >= 999999 ? Infinity : v);
  };

  return (
    <TextField
      label="Visible time (s)"
      value={draft}
      placeholder="∞"
      inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

interface NoteDefaultsModalProps {
  open: boolean;
  onClose: () => void;
}

export function NoteDefaultsModal({ open, onClose }: NoteDefaultsModalProps) {
  const defaults = useEditorStore((s) => s.noteDefaults);
  const set = useEditorStore((s) => s.set);
  const update = (patch: Partial<NoteDefaults>) => set({ noteDefaults: { ...defaults, ...patch } });

  return (
    <Modal
      open={open}
      title="Note defaults"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={() => set({ noteDefaults: INITIAL })}>
            Reset to defaults
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className={styles.sections}>
        <section className={styles.section}>
          <h3 className={styles.heading}>Notes</h3>
          <div className={styles.grid}>
            {NUMBER_FIELDS.map((f) => (
              <NumberField
                key={f.key}
                label={f.label}
                value={defaults[f.key]}
                min={f.min}
                max={f.max}
                onCommit={(v) => update({ [f.key]: v })}
              />
            ))}
            <VisibleTimeField
              value={defaults.visibleTime}
              onCommit={(visibleTime) => update({ visibleTime })}
            />
          </div>
          <Select
            label="Side"
            value={defaults.above ? 'above' : 'below'}
            options={SIDE_OPTIONS}
            onChange={(v) => update({ above: v === 'above' })}
          />
          <Toggle label="Fake" checked={defaults.fake} onChange={(fake) => update({ fake })} />
        </section>
      </div>
    </Modal>
  );
}
