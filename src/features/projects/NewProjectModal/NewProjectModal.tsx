import { useState, type FormEvent } from 'react';
import { Button, Modal, TextField } from '@/components/ui';
import { ProjectFields } from '../ProjectFields/ProjectFields';
import type { NewProjectInput } from '../types';
import styles from './NewProjectModal.module.css';

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: NewProjectInput) => void;
}

const EMPTY: NewProjectInput = {
  name: '',
  artist: '',
  illustrator: '',
  charter: '',
  difficulty: '',
  bpm: 120,
  lines: 1,
};
const FORM_ID = 'new-project-form';

export function NewProjectModal({ open, onClose, onCreate }: NewProjectModalProps) {
  const [form, setForm] = useState(EMPTY);

  const set = <K extends keyof NewProjectInput>(key: K, value: NewProjectInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const close = () => {
    setForm(EMPTY);
    onClose();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onCreate(form);
    setForm(EMPTY);
  };

  return (
    <Modal
      open={open}
      title="New Project"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID} disabled={!form.name.trim()}>
            Create
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className={styles.form} onSubmit={submit}>
        <ProjectFields
          form={form}
          set={set}
          extra={
            <TextField
              label="Initial lines"
              type="number"
              min={0}
              step={1}
              value={form.lines}
              onChange={(e) => set('lines', Math.max(0, Math.floor(Number(e.target.value)) || 0))}
            />
          }
        />
      </form>
    </Modal>
  );
}
