import { create } from 'zustand';
import { renameEffectShader } from '@/features/chart/runtime/commands';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import { playback } from '@/features/editor/playback/playback';
import { setBackground } from '@/features/editor/preview/background';
import { loadMedia, mediaKindOf, unloadMedia } from '@/features/editor/preview/media';
import { named, projectRepo } from '@/features/projects/projectRepo';
import type { AssetKind, FontFiles, MediaBlobs } from '@/features/projects/types';
import {
  customShaderPath,
  putCustomShader,
  removeCustomShader,
  renameCustomShader,
  useShaderLibrary,
} from '@/features/shaders/library';
import { createId } from '@/lib/id';

export const FONT_ACCEPT = '.ttf,.otf,.woff,.woff2';

// Files of the open project. Custom shaders live in useShaderLibrary.
interface LibraryState {
  projectId: string | null;
  audio?: Blob;
  illustration?: Blob;
  media: MediaBlobs;
  fonts: FontFiles;
}

export const useLibraryStore = create<LibraryState>(() => ({
  projectId: null,
  media: {},
  fonts: {},
}));

const set = useLibraryStore.setState;

function projectId() {
  const id = useLibraryStore.getState().projectId;
  if (!id) throw new Error('No project open.');
  return id;
}

const isUsed = (assetId: string) =>
  !!useChartStore.getState().chart?.media.some((m) => m.assetId === assetId);

export async function loadLibrary(id: string) {
  const [project, media, fonts] = await Promise.all([
    projectRepo.get(id),
    projectRepo.getMedia(id),
    projectRepo.getFonts(id),
  ]);
  set({ projectId: id, audio: project?.audio, illustration: project?.illustration, media, fonts });
}

export const clearLibrary = () =>
  set({ projectId: null, audio: undefined, illustration: undefined, media: {}, fonts: {} });

export async function replaceAsset(kind: AssetKind, file: File) {
  await projectRepo.putAsset(projectId(), kind, file);
  if (kind === 'audio') playback.load(file);
  else await setBackground(file);
  set({ [kind]: file });
}

// Media

export async function addMediaFile(file: File) {
  if (!mediaKindOf(file.type)) throw new Error('Unsupported file type.');
  const assetId = createId();
  await projectRepo.putMedia(projectId(), assetId, file);
  set((s) => ({ media: { ...s.media, [assetId]: file } }));
  return assetId;
}

// New contents under the same asset id and name.
export async function replaceMediaFile(assetId: string, file: File) {
  const kind = mediaKindOf(file.type);
  if (!kind) throw new Error('Unsupported file type.');
  const old = useLibraryStore.getState().media[assetId];
  const blob = old instanceof File ? named(file, old.name) : file;
  await projectRepo.putMedia(projectId(), assetId, blob);
  unloadMedia(assetId);
  set((s) => ({ media: { ...s.media, [assetId]: blob } }));
  if (!isUsed(assetId)) return;
  if (!(await loadMedia(assetId, blob))) throw new Error('Could not decode this file.');
  useChartStore.getState().rewrite((c) => ({
    ...c,
    media: c.media.map((m) => (m.assetId === assetId ? { ...m, kind } : m)),
  }));
}

export async function renameMediaFile(assetId: string, name: string) {
  await projectRepo.renameMedia(projectId(), assetId, name);
  set((s) => ({ media: { ...s.media, [assetId]: named(s.media[assetId], name) } }));
}

export async function deleteMediaFile(assetId: string) {
  await projectRepo.deleteMedia(projectId(), assetId);
  unloadMedia(assetId);
  set((s) => {
    const media = { ...s.media };
    delete media[assetId];
    return { media };
  });
}

// Fonts (keyed by file name)

export async function putFontFile(name: string, file: File) {
  await projectRepo.putFont(projectId(), name, file);
  set((s) => ({ fonts: { ...s.fonts, [name]: named(file, name) } }));
}

export async function renameFontFile(from: string, to: string) {
  if (useLibraryStore.getState().fonts[to]) throw new Error('A font with that name exists.');
  await projectRepo.renameFont(projectId(), from, to);
  set((s) => {
    const fonts = { ...s.fonts, [to]: named(s.fonts[from], to) };
    delete fonts[from];
    return { fonts };
  });
}

export async function deleteFontFile(name: string) {
  await projectRepo.deleteFont(projectId(), name);
  set((s) => {
    const fonts = { ...s.fonts };
    delete fonts[name];
    return { fonts };
  });
}

// Shaders (keyed by path '/name.glsl')

export async function putShaderFile(path: string, file: File) {
  const source = await file.text();
  await projectRepo.putShader(projectId(), path, source);
  putCustomShader(path, source);
}

export async function renameShaderFile(from: string, name: string) {
  const to = customShaderPath(name);
  if (to === from) return;
  if (to in useShaderLibrary.getState().custom) throw new Error('A shader with that name exists.');
  await projectRepo.renameShader(projectId(), from, to);
  renameCustomShader(from, to);
  useChartStore.getState().rewrite((c) => renameEffectShader(c, from, to));
}

export async function deleteShaderFile(path: string) {
  await projectRepo.deleteShader(projectId(), path);
  removeCustomShader(path);
}
