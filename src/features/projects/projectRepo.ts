import { getDB } from '@/lib/db';
import { migrateChart } from '@/features/chart/io/migrations';
import type { Chart } from '@/features/chart/model/types';
import type {
  AssetKind,
  FontFiles,
  MediaBlobs,
  Project,
  ProjectAssets,
  ProjectMeta,
  ShaderSources,
} from './types';

const ASSET_KINDS = ['audio', 'illustration'] as const;
const assetKey = (id: string, kind: AssetKind) => `${id}:${kind}`;
const range = (prefix: string) => IDBKeyRange.bound(prefix, `${prefix}\uffff`);
const mediaPrefix = (id: string) => `${id}:media:`;
const mediaRange = (id: string) => range(mediaPrefix(id));
const shaderPrefix = (id: string) => `${id}:shader:`;
const shaderRange = (id: string) => range(shaderPrefix(id));
const fontPrefix = (id: string) => `${id}:font:`;
const fontRange = (id: string) => range(fontPrefix(id));
const shaderBlob = (source: string, path: string) =>
  new File([source], path.slice(1), { type: 'text/plain' });

// Re-wraps a blob with a file name (kept by IndexedDB).
export const named = (blob: Blob, name: string) => new File([blob], name, { type: blob.type });

// Blobs under a key prefix, keyed by the rest of the key.
async function getPrefixed(prefix: string): Promise<Record<string, Blob>> {
  const db = await getDB();
  const [keys, blobs] = await Promise.all([
    db.getAllKeys('assets', range(prefix)),
    db.getAll('assets', range(prefix)),
  ]);
  return Object.fromEntries(keys.map((k, i) => [k.slice(prefix.length), blobs[i]]));
}

// Replaces all blobs in a key range.
async function replaceRange(r: IDBKeyRange, entries: [string, Blob][]) {
  const db = await getDB();
  const tx = db.transaction('assets', 'readwrite');
  await tx.store.delete(r);
  await Promise.all([...entries.map(([k, b]) => tx.store.put(b, k)), tx.done]);
}

async function moveKey(from: string, to: string, wrap: (blob: Blob) => Blob = (b) => b) {
  const db = await getDB();
  const tx = db.transaction('assets', 'readwrite');
  const blob = await tx.store.get(from);
  if (!blob) return;
  await Promise.all([tx.store.delete(from), tx.store.put(wrap(blob), to), tx.done]);
}

export const projectRepo = {
  async listMeta(): Promise<ProjectMeta[]> {
    const db = await getDB();
    const all = await db.getAllFromIndex('projects', 'updatedAt');
    return all.reverse();
  },

  async getMeta(id: string): Promise<ProjectMeta | undefined> {
    const db = await getDB();
    return db.get('projects', id);
  },

  async get(id: string): Promise<Project | undefined> {
    const db = await getDB();
    const [meta, chart, audio, illustration] = await Promise.all([
      db.get('projects', id),
      db.get('charts', id),
      db.get('assets', assetKey(id, 'audio')),
      db.get('assets', assetKey(id, 'illustration')),
    ]);
    return meta && chart ? { meta, chart: migrateChart(chart), audio, illustration } : undefined;
  },

  async put(project: Project) {
    const db = await getDB();
    const tx = db.transaction(['projects', 'charts', 'assets'], 'readwrite');
    const id = project.meta.id;
    const assets = tx.objectStore('assets');
    // Replaces a whole group when given.
    const group = (r: IDBKeyRange, entries: [string, Blob][] | undefined) =>
      entries
        ? [assets.delete(r).then(() => Promise.all(entries.map(([k, b]) => assets.put(b, k))))]
        : [];
    const { media, shaders, fonts } = project;
    await Promise.all([
      ...group(
        mediaRange(id),
        media && Object.entries(media).map(([assetId, b]) => [mediaPrefix(id) + assetId, b]),
      ),
      ...group(
        shaderRange(id),
        shaders &&
          Object.entries(shaders).map(([path, s]) => [shaderPrefix(id) + path, shaderBlob(s, path)]),
      ),
      ...group(
        fontRange(id),
        fonts && Object.entries(fonts).map(([name, b]) => [fontPrefix(id) + name, named(b, name)]),
      ),
      tx.objectStore('projects').put(project.meta),
      tx.objectStore('charts').put(project.chart, id),
      ...ASSET_KINDS.map((kind) => {
        const blob = (project as ProjectAssets)[kind];
        return blob ? assets.put(blob, assetKey(id, kind)) : assets.delete(assetKey(id, kind));
      }),
      tx.done,
    ]);
  },

  async updateMeta(meta: ProjectMeta) {
    const db = await getDB();
    await db.put('projects', meta);
  },

  async saveChart(id: string, chart: Chart) {
    const db = await getDB();
    await db.put('charts', chart, id);
  },

  async getAsset(id: string, kind: AssetKind): Promise<Blob | undefined> {
    const db = await getDB();
    return db.get('assets', assetKey(id, kind));
  },

  async putAsset(id: string, kind: AssetKind, blob: Blob) {
    const db = await getDB();
    await db.put('assets', blob, assetKey(id, kind));
  },

  getMedia: (id: string): Promise<MediaBlobs> => getPrefixed(mediaPrefix(id)),

  async putMedia(id: string, assetId: string, blob: Blob) {
    const db = await getDB();
    await db.put('assets', blob, mediaPrefix(id) + assetId);
  },

  // Replaces all media files.
  setMedia: (id: string, media: MediaBlobs) =>
    replaceRange(
      mediaRange(id),
      Object.entries(media).map(([assetId, b]) => [mediaPrefix(id) + assetId, b]),
    ),

  async renameMedia(id: string, assetId: string, name: string) {
    const key = mediaPrefix(id) + assetId;
    await moveKey(key, key, (b) => named(b, name));
  },

  async deleteMedia(id: string, assetId: string) {
    const db = await getDB();
    await db.delete('assets', mediaPrefix(id) + assetId);
  },

  async getShaders(id: string): Promise<ShaderSources> {
    const files = await getPrefixed(shaderPrefix(id));
    const entries = await Promise.all(
      Object.entries(files).map(async ([path, b]) => [path, await b.text()] as const),
    );
    return Object.fromEntries(entries);
  },

  async putShader(id: string, path: string, source: string) {
    const db = await getDB();
    await db.put('assets', shaderBlob(source, path), shaderPrefix(id) + path);
  },

  // Replaces all custom shaders.
  setShaders: (id: string, sources: ShaderSources) =>
    replaceRange(
      shaderRange(id),
      Object.entries(sources).map(([path, s]) => [shaderPrefix(id) + path, shaderBlob(s, path)]),
    ),

  renameShader: (id: string, from: string, to: string) =>
    moveKey(shaderPrefix(id) + from, shaderPrefix(id) + to, (b) => named(b, to.slice(1))),

  async deleteShader(id: string, path: string) {
    const db = await getDB();
    await db.delete('assets', shaderPrefix(id) + path);
  },

  getFonts: (id: string): Promise<FontFiles> => getPrefixed(fontPrefix(id)),

  async putFont(id: string, name: string, blob: Blob) {
    const db = await getDB();
    await db.put('assets', named(blob, name), fontPrefix(id) + name);
  },

  // Replaces all fonts.
  setFonts: (id: string, fonts: FontFiles) =>
    replaceRange(
      fontRange(id),
      Object.entries(fonts).map(([name, b]) => [fontPrefix(id) + name, named(b, name)]),
    ),

  renameFont: (id: string, from: string, to: string) =>
    moveKey(fontPrefix(id) + from, fontPrefix(id) + to, (b) => named(b, to)),

  async deleteFont(id: string, name: string) {
    const db = await getDB();
    await db.delete('assets', fontPrefix(id) + name);
  },

  async remove(id: string) {
    const db = await getDB();
    const tx = db.transaction(['projects', 'charts', 'assets'], 'readwrite');
    await Promise.all([
      tx.objectStore('projects').delete(id),
      tx.objectStore('charts').delete(id),
      tx.objectStore('assets').delete(mediaRange(id)),
      tx.objectStore('assets').delete(shaderRange(id)),
      tx.objectStore('assets').delete(fontRange(id)),
      ...ASSET_KINDS.map((kind) => tx.objectStore('assets').delete(assetKey(id, kind))),
      tx.done,
    ]);
  },
};
