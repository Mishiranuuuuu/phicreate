import { EventGrid } from '../EventGrid/EventGrid';
import { NoteGrid } from '../NoteGrid/NoteGrid';
import { clearClipboard, useClipboard } from '../clipboard';
import { useEditorStore } from '../useEditorStore';
import { PreviewCanvas } from '../preview/PreviewCanvas';
import styles from './EditorGrid.module.css';

export function EditorGrid() {
  const mode = useEditorStore((s) => s.mode);
  const fullscreen = useEditorStore((s) => s.fullscreen);
  const previewBehind = useEditorStore((s) => s.previewBehind);
  const activeGrid = useEditorStore((s) => s.activeGrid);
  // Text and media objects have no notes.
  const objectOnly = useEditorStore((s) => s.selectedObjectId !== null);
  const showPreview = fullscreen || mode === 'preview' || previewBehind;
  const showEdit = !fullscreen && mode === 'edit';

  return (
    <section className={styles.grid}>
      <div className={styles.stageArea}>
        <div className={fullscreen ? styles.stageFullscreen : styles.stage}>
          {showEdit && <ClipboardReminder />}
          {showPreview && <PreviewCanvas />}
          {showEdit && (
            <div className={objectOnly ? styles.splitCentered : styles.split}>
              {!objectOnly && (
                <div className={activeGrid === 'notes' ? styles.halfActive : styles.half}>
                  <NoteGrid />
                </div>
              )}
              <div className={activeGrid === 'events' ? styles.halfActive : styles.half}>
                <EventGrid />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ClipboardReminder() {
  const clip = useClipboard((s) => s.clip);
  if (!clip) return null;
  const count = clip.kind === 'notes' ? clip.notes.length : clip.events.length;
  const label = `${count} ${clip.kind === 'notes' ? 'note' : 'event'}${count === 1 ? '' : 's'}`;
  return (
    <div className={styles.clipboard}>
      <span>Clipboard: {label} · Ctrl+V pastes at the cursor</span>
      <button type="button" title="Clear clipboard" onClick={clearClipboard}>
        ×
      </button>
    </div>
  );
}
