import { DEFAULT_FONT } from '@/features/chart/model/types';
import type { FontFiles } from '@/features/projects/types';

// Library fonts registered with the document, keyed by file name.

interface Entry {
  blob: Blob;
  face?: FontFace;
  loaded: boolean;
}

const registered = new Map<string, Entry>();
const family = (name: string) => `pc-font:${name.replace(/["\\]/g, '')}`;
const FALLBACK = `${DEFAULT_FONT}, system-ui, sans-serif`;

// Canvas font-family list for a font file name; unknown or still-loading fonts fall back.
export const fontFamily = (name: string) =>
  registered.get(name)?.loaded ? `"${family(name)}", ${FALLBACK}` : FALLBACK;

function drop(entry: Entry) {
  if (entry.face) document.fonts.delete(entry.face);
}

// Registers added / replaced fonts and drops removed ones.
export function syncFonts(fonts: FontFiles) {
  for (const [name, entry] of registered) {
    if (fonts[name] === entry.blob) continue;
    drop(entry);
    registered.delete(name);
  }
  for (const [name, blob] of Object.entries(fonts)) {
    if (registered.has(name)) continue;
    const entry: Entry = { blob, loaded: false };
    registered.set(name, entry);
    void blob
      .arrayBuffer()
      .then((data) => new FontFace(family(name), data).load())
      .then((face) => {
        if (registered.get(name) !== entry) return;
        document.fonts.add(face);
        entry.face = face;
        entry.loaded = true;
      })
      .catch(() => undefined);
  }
}
