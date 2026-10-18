import { useState } from 'react';
import {
  Button,
  CheckIcon,
  DownloadIcon,
  IconButton,
  Modal,
  PencilIcon,
  ReplaceIcon,
  TrashIcon,
} from '@/components/ui';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import { CommitInput } from '@/features/editor/CommitInput';
import { MEDIA_ACCEPT } from '@/features/editor/preview/media';
import { projectRepo } from '@/features/projects/projectRepo';
import { toExport } from '@/features/projects/projectFactory';
import { customShaderPath, SHADER_ACCEPT, useShaderLibrary } from '@/features/shaders/library';
import { downloadBlob, downloadJson, pickFile } from '@/lib/file';
import {
  addMediaFile,
  deleteFontFile,
  deleteMediaFile,
  deleteShaderFile,
  FONT_ACCEPT,
  putFontFile,
  putShaderFile,
  renameFontFile,
  renameMediaFile,
  renameShaderFile,
  replaceAsset,
  replaceMediaFile,
  useLibraryStore,
} from '../useLibraryStore';
import { fileName, withExt } from '../fileNames';
import styles from './LibraryModal.module.css';

const CATEGORIES = [
  { id: 'essential', label: 'Essential' },
  { id: 'media', label: 'Media' },
  { id: 'fonts', label: 'Fonts' },
  { id: 'shaders', label: 'Shaders' },
] as const;

type Category = (typeof CATEGORIES)[number]['id'];

const UPLOAD_ACCEPT: Partial<Record<Category, string>> = {
  media: MEDIA_ACCEPT,
  fonts: FONT_ACCEPT,
  shaders: SHADER_ACCEPT,
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

const describe = (blob: Blob) => [blob.type || 'unknown', formatSize(blob.size)].join(' · ');

interface LibraryModalProps {
  open: boolean;
  onClose: () => void;
}

export function LibraryModal({ open, onClose }: LibraryModalProps) {
  const [category, setCategory] = useState<Category>('essential');
  const [status, setStatus] = useState<string | null>(null);
  const library = useLibraryStore();
  const shaders = useShaderLibrary((s) => s.custom);
  const chart = useChartStore((s) => s.chart);

  const counts: Record<Category, number> = {
    essential: 3,
    media: Object.keys(library.media).length,
    fonts: Object.keys(library.fonts).length,
    shaders: Object.keys(shaders).length,
  };

  // Runs an action, surfacing errors.
  const run = (fn: () => Promise<unknown>) => {
    setStatus(null);
    fn().catch((e: unknown) => setStatus(e instanceof Error ? e.message : 'Something went wrong.'));
  };

  const replaceWith = (accept: string, fn: (file: File) => Promise<unknown>) => () =>
    run(async () => {
      const file = await pickFile(accept);
      if (file) await fn(file);
    });

  const upload = () => {
    const accept = UPLOAD_ACCEPT[category];
    if (!accept) return;
    replaceWith(accept, (file) => {
      if (category === 'media') return addMediaFile(file);
      if (category === 'fonts') return putFontFile(file.name, file);
      return putShaderFile(customShaderPath(file.name), file);
    })();
  };

  const downloadChart = () =>
    run(async () => {
      const meta = library.projectId && (await projectRepo.getMeta(library.projectId));
      if (!meta || !chart) throw new Error('Project not loaded.');
      downloadJson(toExport({ meta, chart }), 'chart.json');
    });

  const rows = () => {
    switch (category) {
      case 'essential':
        return (
          <>
            {(['illustration', 'audio'] as const).map((kind) => {
              const blob = library[kind];
              const accept = kind === 'audio' ? 'audio/*' : 'image/*';
              return (
                <FileRow
                  key={kind}
                  label={kind === 'audio' ? 'Audio' : 'Illustration'}
                  name={blob ? fileName(blob, withExt(kind, blob)) : 'Not set'}
                  detail={blob ? describe(blob) : undefined}
                  onReplace={replaceWith(accept, (file) => replaceAsset(kind, file))}
                  onDownload={blob && (() => downloadBlob(blob, fileName(blob, withExt(kind, blob))))}
                />
              );
            })}
            <FileRow
              label="Chart"
              name="chart.json"
              detail={chart ? `${chart.lines.length} lines · PhiCreate project JSON` : undefined}
              onDownload={downloadChart}
            />
          </>
        );
      case 'media':
        return Object.entries(library.media).map(([assetId, blob]) => {
          const users = chart?.media.filter((m) => m.assetId === assetId) ?? [];
          const name = fileName(blob, withExt(users[0]?.name ?? assetId, blob));
          return (
            <FileRow
              key={assetId}
              name={name}
              detail={describe(blob)}
              usedBy={users.length}
              onReplace={replaceWith(MEDIA_ACCEPT, (file) => replaceMediaFile(assetId, file))}
              onRename={(to) => run(() => renameMediaFile(assetId, to))}
              onDownload={() => downloadBlob(blob, name)}
              onDelete={() => run(() => deleteMediaFile(assetId))}
            />
          );
        });
      case 'fonts':
        return Object.entries(library.fonts).map(([name, blob]) => (
          <FileRow
            key={name}
            name={name}
            detail={describe(blob)}
            onReplace={replaceWith(FONT_ACCEPT, (file) => putFontFile(name, file))}
            onRename={(to) => run(() => renameFontFile(name, to))}
            onDownload={() => downloadBlob(blob, name)}
            onDelete={() => run(() => deleteFontFile(name))}
          />
        ));
      case 'shaders':
        return Object.entries(shaders).map(([path, source]) => {
          const name = path.slice(1);
          const blob = new Blob([source], { type: 'text/plain' });
          return (
            <FileRow
              key={path}
              name={name}
              detail={describe(blob)}
              usedBy={chart?.effects.filter((e) => e.shader === path).length ?? 0}
              onReplace={replaceWith(SHADER_ACCEPT, (file) => putShaderFile(path, file))}
              onRename={(to) => run(() => renameShaderFile(path, to))}
              onDownload={() => downloadBlob(blob, name)}
              onDelete={() => run(() => deleteShaderFile(path))}
            />
          );
        });
    }
  };

  const title = CATEGORIES.find((c) => c.id === category)!.label;

  return (
    <Modal open={open} title="Library" onClose={onClose} width={760}>
      <div className={styles.layout}>
        <nav className={styles.nav}>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`${styles.tab} ${c.id === category ? styles.active : ''}`}
              onClick={() => {
                setCategory(c.id);
                setStatus(null);
              }}
            >
              <span>{c.label}</span>
              <span className={styles.count}>{counts[c.id]}</span>
            </button>
          ))}
        </nav>
        <section className={styles.content}>
          <header className={styles.header}>
            <h3 className={styles.heading}>{title}</h3>
            {UPLOAD_ACCEPT[category] && (
              <Button size="sm" variant="primary" onClick={upload}>
                Upload
              </Button>
            )}
          </header>
          {status && <p className={styles.error}>{status}</p>}
          {counts[category] ? (
            <ul className={styles.list}>{rows()}</ul>
          ) : (
            <p className={styles.empty}>No {title.toLowerCase()} files yet. Click 'Upload' to import files.</p>
          )}
          {category === 'fonts' && (
            <p className={styles.note}>Apply custom fonts to text objects with font events. Saira is the default.</p>
          )}
        </section>
      </div>
    </Modal>
  );
}

interface FileRowProps {
  label?: string;
  name: string;
  detail?: string;
  // Omitted = not tracked.
  usedBy?: number;
  onReplace?: () => void;
  onRename?: (name: string) => void;
  onDownload?: () => void;
  onDelete?: () => void;
}

function FileRow({
  label,
  name,
  detail,
  usedBy,
  onReplace,
  onRename,
  onDownload,
  onDelete,
}: FileRowProps) {
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const inUse = !!usedBy;

  return (
    <li className={styles.row}>
      <div className={styles.info}>
        {label && <span className={styles.label}>{label}</span>}
        {renaming && onRename ? (
          <CommitInput
            autoFocus
            className={styles.rename}
            value={name}
            onBlur={() => setRenaming(false)}
            onCommit={(text) => {
              const next = text.trim();
              if (!next) return false;
              onRename(next);
            }}
          />
        ) : (
          <span className={styles.name} title={name}>
            {name}
          </span>
        )}
        {detail && <span className={styles.detail}>{detail}</span>}
      </div>
      {usedBy !== undefined && (
        <span className={`${styles.badge} ${inUse ? styles.used : ''}`}>
          {inUse ? `Used by ${usedBy}` : 'Unused'}
        </span>
      )}
      <div className={styles.actions}>
        {onReplace && (
          <IconButton label="Replace" className={styles.action} onClick={onReplace}>
            <ReplaceIcon />
          </IconButton>
        )}
        {onRename && (
          <IconButton label="Rename" className={styles.action} onClick={() => setRenaming(true)}>
            <PencilIcon />
          </IconButton>
        )}
        {onDownload && (
          <IconButton label="Download" className={styles.action} onClick={onDownload}>
            <DownloadIcon />
          </IconButton>
        )}
        {onDelete && (
          <IconButton
            label={confirming ? 'Confirm delete' : 'Delete'}
            className={`${styles.action} ${styles.delete} ${confirming ? styles.confirm : ''}`}
            disabled={inUse}
            title={inUse ? `Used by ${usedBy} object${usedBy === 1 ? '' : 's'}` : undefined}
            onBlur={() => setConfirming(false)}
            onClick={() => (confirming ? onDelete() : setConfirming(true))}
          >
            {confirming ? <CheckIcon /> : <TrashIcon />}
          </IconButton>
        )}
      </div>
    </li>
  );
}
