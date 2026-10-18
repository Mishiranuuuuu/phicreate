import { useState, type FormEvent } from 'react';
import { Button, Modal, TextField } from '@/components/ui';
import { importFromPhira } from '../importPhira';
import type { ImportResult } from '../types';

interface PhiraImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: (result: ImportResult) => void;
}

const FORM_ID = 'phira-import-form';

export function PhiraImportModal({ open, onClose, onImported }: PhiraImportModalProps) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setValue('');
    setError(null);
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await importFromPhira(value);
      setBusy(false);
      setValue('');
      onImported(result);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Import failed.');
    }
  };

  return (
    <Modal
      open={open}
      title="Import from Phira"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID} disabled={busy || !value.trim()}>
            {busy ? 'Importing…' : 'Import'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit}>
        <TextField
          label="Chart URL or ID"
          hint={error ?? 'e.g. phira.moe/chart/1234 or 1234'}
          placeholder="phira.moe/chart/1234"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
        />
      </form>
    </Modal>
  );
}
