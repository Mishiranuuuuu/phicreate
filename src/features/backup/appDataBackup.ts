import { strFromU8, strToU8, type Zippable } from 'fflate';
import { getDB } from '@/lib/db';
import { unzipAsync, zipAsync } from '@/lib/zip';
import { named, projectRepo } from '../projects/projectRepo';
import { PROJECT_SCHEMA_VERSION, type ProjectMeta } from '../projects/types';
import { normalizeSettings, type Settings } from '../settings/types';

const FORMAT = 'phicreate-appdata';
const MANIFEST = 'phicreate.json';
const LEGACY_MANIFEST = 'data.json';
const PROJECT_FILE = 'project.json';
const ASSET_KINDS = ['audio', 'illustration'] as const;

type AssetKind = (typeof ASSET_KINDS)[number];

// Archive layout:
//   phicreate.json                  format, version, settings
//   projects/<id>/project.json      meta, chart, file MIME types, shaders
//   projects/<id>/<kind>            audio / illustration
//   projects/<id>/media/<assetId>   media objects
//   projects/<id>/fonts/<name>      fonts
// Legacy (data.json): everything in one manifest, files under assets/<id>/.

// Legacy media entries are a bare MIME type.
type FileInfo = string | { type: string; name: string };

interface Manifest {
  format: typeof FORMAT;
  version: number;
  settings: Settings;
}

interface ProjectEntry {
  meta: ProjectMeta;
  chart: unknown;
  assets: Partial<Record<AssetKind, string>>;
  // Media object files by asset id.
  media?: Record<string, FileInfo>;
  // Font files: file name -> MIME type.
  fonts?: Record<string, string>;
  // Custom shader sources by path.
  shaders?: Record<string, string>;
}

interface LegacyManifest extends Manifest {
  projects: ProjectEntry[];
}

const layout = (root: string) => ({
  asset: (id: string, kind: AssetKind) => `${root}/${id}/${kind}`,
  media: (id: string, assetId: string) => `${root}/${id}/media/${assetId}`,
  font: (id: string, name: string) => `${root}/${id}/fonts/${name}`,
});
type Layout = ReturnType<typeof layout>;

const current = layout('projects');
const legacy = layout('assets');
const projectPath = (id: string) => `projects/${id}/${PROJECT_FILE}`;
const toBlob = (data: Uint8Array, type: string) => new Blob([data.slice()], { type });
const json = (data: unknown) => strToU8(JSON.stringify(data));
// Audio and images are already compressed.
const raw = async (blob: Blob): Promise<[Uint8Array, { level: 0 }]> => [
  new Uint8Array(await blob.arrayBuffer()),
  { level: 0 },
];

const parse = (data: Uint8Array | undefined): unknown => {
  if (!data) return null;
  try {
    return JSON.parse(strFromU8(data));
  } catch {
    return null;
  }
};

export async function exportAppData(): Promise<Blob> {
  const db = await getDB();
  const [metas, settings] = await Promise.all([db.getAll('projects'), db.get('settings', 'user')]);
  const files: Zippable = {};

  for (const meta of metas) {
    const chart = await db.get('charts', meta.id);
    if (!chart) continue;
    const assets: ProjectEntry['assets'] = {};
    for (const kind of ASSET_KINDS) {
      const blob = await db.get('assets', `${meta.id}:${kind}`);
      if (!blob) continue;
      assets[kind] = blob.type;
      files[current.asset(meta.id, kind)] = await raw(blob);
    }
    const media: Record<string, FileInfo> = {};
    for (const [assetId, blob] of Object.entries(await projectRepo.getMedia(meta.id))) {
      media[assetId] = { type: blob.type, name: blob instanceof File ? blob.name : '' };
      files[current.media(meta.id, assetId)] = await raw(blob);
    }
    const fonts: Record<string, string> = {};
    for (const [name, blob] of Object.entries(await projectRepo.getFonts(meta.id))) {
      fonts[name] = blob.type;
      files[current.font(meta.id, name)] = await raw(blob);
    }
    const shaders = await projectRepo.getShaders(meta.id);
    const entry: ProjectEntry = { meta, chart, assets, media, fonts, shaders };
    files[projectPath(meta.id)] = json(entry);
  }

  const manifest: Manifest = {
    format: FORMAT,
    version: PROJECT_SCHEMA_VERSION,
    settings: normalizeSettings(settings),
  };
  files[MANIFEST] = json(manifest);
  const archive = await zipAsync(files);
  return new Blob([archive.slice()], { type: 'application/zip' });
}

async function importProject(
  entry: ProjectEntry,
  files: Record<string, Uint8Array>,
  paths: Layout,
) {
  const { meta, chart, assets = {}, media = {}, fonts = {}, shaders = {} } = entry;
  if (!meta?.id || !chart) return;
  const db = await getDB();
  const tx = db.transaction(['projects', 'charts', 'assets'], 'readwrite');
  await Promise.all([
    tx.objectStore('projects').put({
      ...meta,
      illustrator: meta.illustrator ?? '',
      difficulty: meta.difficulty ?? '',
    }),
    tx.objectStore('charts').put(chart, meta.id),
    ...ASSET_KINDS.map((kind) => {
      const key = `${meta.id}:${kind}`;
      const data = files[paths.asset(meta.id, kind)];
      return data
        ? tx.objectStore('assets').put(toBlob(data, assets[kind] ?? ''), key)
        : tx.objectStore('assets').delete(key);
    }),
    tx.done,
  ]);
  const mediaBlobs: Record<string, Blob> = {};
  for (const [assetId, info] of Object.entries(media)) {
    const data = files[paths.media(meta.id, assetId)];
    if (!data) continue;
    const { type, name } = typeof info === 'string' ? { type: info, name: '' } : info;
    mediaBlobs[assetId] = name ? named(toBlob(data, type), name) : toBlob(data, type);
  }
  const fontBlobs: Record<string, Blob> = {};
  for (const [name, type] of Object.entries(fonts)) {
    const data = files[paths.font(meta.id, name)];
    if (data) fontBlobs[name] = toBlob(data, type);
  }
  await projectRepo.setMedia(meta.id, mediaBlobs);
  await projectRepo.setFonts(meta.id, fontBlobs);
  await projectRepo.setShaders(meta.id, shaders);
}

// Merges projects (same id overwrites) and replaces settings. Returns false if invalid.
export async function importAppData(file: Blob): Promise<boolean> {
  let files: Record<string, Uint8Array>;
  try {
    files = await unzipAsync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return false;
  }
  const isLegacy = !files[MANIFEST] && !!files[LEGACY_MANIFEST];
  const manifest = parse(files[isLegacy ? LEGACY_MANIFEST : MANIFEST]) as Partial<LegacyManifest>;
  if (manifest?.format !== FORMAT) return false;

  if (isLegacy) {
    if (!Array.isArray(manifest.projects)) return false;
    for (const entry of manifest.projects) await importProject(entry, files, legacy);
  } else {
    const entries = Object.keys(files).filter((p) =>
      new RegExp(`^projects/[^/]+/${PROJECT_FILE}$`).test(p),
    );
    for (const path of entries) {
      const entry = parse(files[path]) as ProjectEntry | null;
      if (entry) await importProject(entry, files, current);
    }
  }
  if (manifest.settings) {
    const db = await getDB();
    await db.put('settings', normalizeSettings(manifest.settings), 'user');
  }
  return true;
}

// Removes every project, asset and setting.
export async function clearAppData() {
  const db = await getDB();
  const tx = db.transaction(['projects', 'charts', 'assets', 'settings'], 'readwrite');
  await Promise.all([
    tx.objectStore('projects').clear(),
    tx.objectStore('charts').clear(),
    tx.objectStore('assets').clear(),
    tx.objectStore('settings').clear(),
    tx.done,
  ]);
}
