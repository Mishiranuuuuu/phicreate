import { useEffect, useState } from 'react';
import { Button, Modal, Segmented } from '@/components/ui';
import type { FakeNotes } from '@/features/chart/io/official/toOfficial';
import { exportProject, type ExportFormat } from '../exportProject';
import type { Project } from '../types';
import styles from './ExportModal.module.css';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  // Latest project state (the editor passes its unsaved chart).
  load: () => Promise<Project | null | undefined>;
}

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'phicreate', label: 'PhiCreate' },
  { value: 'rpe', label: 'Re:PhiEdit' },
  { value: 'official', label: 'Official (v3)' },
];

const NOTICES: Record<ExportFormat, string[]> = {
  phicreate: [
    'Packages the chart with the audio and illustration.',
	'Nothing dropped or converted.',
	'Select this if your chart is still WIP.',
  ],
  rpe: [
    'Converts the chart to the RPE format, then packages it with the audio and illustration. Adds info.txt.',
    'Scale events across multiple layers are baked into one. Shaders and videos are defined in an extra.json file.',
    'Dropped: Text font, text size, custom UI text, GIF and video start events, video movement.',
	'Select this for best compatability with Phira or other programs.',
  ],
  official: [
    'Converts the chart to the Phigros v3 format, then packages it with the audio and illustration. Adds info.txt.',
    'All events on all layers, parents, Y-offset, and easings are baked into linear events on one layer or a new line, on the first BPM.',
    'Dropped: Text, media, shaders, line scale and color, note alpha, visible time, tint, UI manipulation.',
	'Select this for modding purposes (adding fanmades to the official game).',
  ],
};

const FAKE_OPTIONS: { value: FakeNotes; label: string }[] = [
  { value: 'delete', label: 'Delete' },
  { value: 'real', label: 'Make real' },
];

const NOISE_OPTIONS = [
  { value: 'keep', label: 'Keep' },
  { value: 'remove', label: 'Remove' },
] as const;

export function ExportModal({ open, onClose, load }: ExportModalProps) {
  if (!open) return null;
  return <ExportDialog onClose={onClose} load={load} />;
}

function ExportDialog({ onClose, load }: Omit<ExportModalProps, 'open'>) {
  const [project, setProject] = useState<Project | null>(null);
  const [format, setFormat] = useState<ExportFormat>('phicreate');
  const [fakeNotes, setFakeNotes] = useState<FakeNotes>('delete');
  const [noise, setNoise] = useState<'keep' | 'remove'>('keep');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Loaded once per opening.
  const [loading] = useState(load);

  useEffect(() => {
    void loading.then((p) => (p ? setProject(p) : setError('Project not found.')));
  }, [loading]);

  const fakeCount = project?.chart.lines.reduce(
    (n, l) => n + l.notes.filter((x) => x.fake).length,
    0,
  );
  const noiseCount = project?.chart.noiseFields.length ?? 0;

  const submit = async () => {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      await exportProject(project, { format, fakeNotes, noiseFields: noise === 'keep' });
      onClose();
    } catch (e) {
      console.error(e);
      setError('Export failed.');
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Export"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!project || busy}>
            {busy ? 'Exporting…' : 'Export'}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <Segmented label="Format" value={format} options={FORMATS} onChange={setFormat} />
        <ul className={styles.notice}>
          {NOTICES[format].map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        {format === 'official' && (
          <Segmented
            label="Fake notes"
            hint={`Not supported in this format; ${fakeCount ?? 0} in chart`}
            value={fakeNotes}
            options={FAKE_OPTIONS}
            onChange={setFakeNotes}
          />
        )}
        {format === 'rpe' && noiseCount > 0 && (
          <Segmented
            label="Noise fields"
            hint="Only supported by RPE-Next (after v0.10.0)"
            value={noise}
            options={[...NOISE_OPTIONS]}
            onChange={setNoise}
          />
        )}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Modal>
  );
}
