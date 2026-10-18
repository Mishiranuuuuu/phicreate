# PhiCreate Chart Data Plan

How chart data and PhiCreate metadata are modeled, stored, and exchanged. This is a design doc for the editor build-out; nothing here is implemented yet beyond the stub in `src/features/projects/types.ts`.

## 1. Scope

- **PCC (PhiCreate Chart) is the only format** for now. Import and export are PCC only; no conversion logic yet.
- **Follow RPE conventions** (beats, coordinates, speed units, easing IDs) so charts feel familiar and a converter can be added later without remodeling.
- **More versatile than RPE**: unlimited event layers, room for extended events and block areas.

| Priority | Features |
|---|---|
| Now | Timing (BPM list, offset), judge lines, parent lines, unlimited event layers (move / rotate / alpha / speed / scale), notes, project metadata, assets, storage, PCC import/export |
| Later | Extended events (color, text, GIF), note controls, line textures, curve note tracks |
| Future | Block areas (noise domains) |
| Not planned | Official / phichain compatibility. RPE conversion (possible later, not designed for now) |

## 2. Inspiration from other formats

| Idea | Source | Adopted as |
|---|---|---|
| Beats as `[whole, num, den]` + BPM list | RPE, phichain | Core time unit |
| 1350 × 900 centered canvas, speed 1.0 = 120 units/s | RPE | Coordinate system and speed unit |
| Easing table (1 = linear … 29 = in-out elastic), easing clip, bezier | RPE | `Easing` type |
| Additive event layers | RPE (capped at 5) | Unlimited, user-managed layers |
| Constant vs. transition events | phichain | `from === to` treated as constant; no separate type |
| Editor constructs that bake into plain data (curve note tracks) | phichain | Curve tracks (later) |
| Versioned format + migration chain | phichain | §9 |
| Block area timing/stages | Official 4.0 | Reserved for future |

## 3. Core primitives

```ts
// [whole, numerator, denominator], always reduced, 0 <= numerator < denominator.
type Beat = [number, number, number];

type Id = string; // crypto.randomUUID()

interface BpmPoint { beat: Beat; bpm: number }
```

- `beat.ts`: `add`, `sub`, `cmp`, `toFloat`, `fromFloat(value, density)` (snap), `reduce`.
- `timing.ts`: `beatToSeconds` / `secondsToBeat` from the BPM list (precomputed segments + binary search).
- Offset in ms (the stub already uses `offsetMs`).

**Units**: canvas 1350 × 900, origin at center, +Y up; rotation in degrees (RPE direction); opacity 0–255; speed in RPE units.

## 4. Chart model

```ts
interface Chart {
  formatVersion: number;          // PCC schema version
  offsetMs: number;
  bpmList: BpmPoint[];            // sorted, first at beat 0
  lines: JudgeLine[];             // flat; hierarchy via parentId
  lineGroups: LineGroup[];        // { id, name }
  timeTags: TimeTag[];            // { id, name, beat } bookmarks
  editor: EditorChartMeta;        // §6
  blockAreas?: BlockArea[];       // future, reserved
}

interface JudgeLine {
  id: Id;
  name: string;
  parentId: Id | null;
  rotateWithParent: boolean;
  zOrder: number;
  groupId: Id | null;
  isCover: boolean;               // hide notes below the line
  layers: EventLayer[];           // 1..n, channels summed across layers
  notes: Note[];
  // Later:
  extended?: ExtendedChannels;
  texture?: AssetRef;
  anchor?: [number, number];
  noteControls?: NoteControls;
}

interface EventLayer {
  id: Id;
  name: string;
  moveX: NumEvent[];
  moveY: NumEvent[];
  rotate: NumEvent[];
  alpha: NumEvent[];
  speed: NumEvent[];
  scaleX: NumEvent[];
  scaleY: NumEvent[];
}

interface Event<T> {
  id: Id;
  start: Beat;
  end: Beat;
  from: T;
  to: T;
  easing: Easing;
}
type NumEvent = Event<number>;

type Easing =
  | { kind: 'preset'; id: number; clip?: [number, number] } // RPE easing ID + left/right clip
  | { kind: 'bezier'; points: [number, number, number, number] };

interface Note {
  id: Id;
  type: 'tap' | 'drag' | 'hold' | 'flick';
  beat: Beat;
  endBeat?: Beat;                 // hold only
  x: number;                      // relative to line center
  above: boolean;
  speed: number;                  // multiplier, default 1
  fake: boolean;
  alpha: number;                  // 0–255
  size: number;                   // width multiplier
  yOffset: number;
  visibleTime: number;            // seconds, default Infinity
  tint?: [number, number, number];
  hitsound?: AssetRef;
}
```

**Layers**
- A line starts with one layer; users add, rename, reorder, and delete layers freely. No cap.
- Each channel's value at time *t* = sum of that channel across all layers.
- Base layer defaults: move/rotate 0, alpha 0, speed 10, scale 1. Extra layers default every channel to 0, so an empty layer changes nothing.
- Layer order doesn't affect the result (addition), but is kept for display.
- Muting is editor-only (§6): muted layers are skipped in the editor preview but always count in the chart data.

**Events**
- Within one channel of one layer, events are sorted by `start` and **must not overlap** (enforced by store actions and import validation).
- Before the first event a channel holds its default; after the last event it holds the last `to` (RPE semantics).
- One `easing.ts` owns the preset table and evaluators (preset, clipped, bezier).

**Extended channels (later)** are single-track, not layered, since their values don't add:

```ts
interface ExtendedChannels {
  color: Event<[number, number, number]>[];  // default white
  text: Event<string>[];                     // shown text; supports %P% interpolation
  gif: NumEvent[];                           // playback progress 0–1
}
```

**Block areas (future)**: reserve `chart.blockAreas`, modeled after the official 4.0 shape (corners, appear/enable/disable/disappear times, move/rotate/scale keyframes), using beats and canvas coordinates instead of seconds and percentages.

**Serialization**: defaults are omitted on save; `withDefaults()` fills them on load.

## 5. Project and asset metadata

Extend the existing `ProjectMeta`:

```ts
interface ProjectMeta {
  id; name; createdAt; updatedAt; schemaVersion;  // existing
  songName; artist; charter;                      // existing
  illustrator: string;
  level: string;          // e.g. "IN Lv.15"
  difficulty?: number;
  previewStartMs?: number;
  music: AssetRef | null;
  illustration: AssetRef | null;
  durationMs?: number;    // cached from audio decode
}

type AssetRef = { assetId: Id; name: string; mime: string };
```

Assets (music, illustration, later textures and hitsounds) are stored as Blobs and referenced by ID. Charts never embed binary data.

## 6. PhiCreate editor metadata

Two tiers, so playback data stays separate from editor-only state.

**Chart-level (`chart.editor`, saved and exported with the chart):**
- Line display: color tag, `locked`, `hidden` (editor only, never affects playback).
- Curve note tracks (later): `{ id, lineId, fromNoteId, toNoteId, noteType, density, curve: Easing }`. Generated notes stay virtual and can be "baked" into real notes on demand.

**Session-level (own IndexedDB store, never exported):**
- Playhead, zoom, beat division, selected line/layer, open panels, scroll positions.
- Muted layer IDs (preview only; never affects chart data or exports).

Rule of thumb: if losing it changes how the chart plays, it's chart data. If it only changes how the editor looks, it's session state.

## 7. Storage (IndexedDB)

Bump `DB_VERSION` to 2 in `src/lib/db.ts`:

| Store | Key | Value | Notes |
|---|---|---|---|
| `projects` | id | `ProjectMeta` | existing |
| `charts` | projectId | `Chart` | existing, typed |
| `assets` | assetId | `{ projectId, blob, mime, name, size }` | index on `projectId` |
| `editorState` | projectId | session state (§6) | |
| `snapshots` | auto id | `{ projectId, createdAt, chart }` | index on `projectId`; keep last N for recovery |
| `settings` | key | `Settings` | existing |

- Autosave: debounce (~2 s) after edits, plus on `visibilitychange` / `beforeunload`.
- Deleting a project removes its assets, editor state, and snapshots in one transaction.
- Request `navigator.storage.persist()` after the first save.

## 8. Runtime model (in memory)

The persisted `Chart` is the source of truth; the store adds derived caches.

- **Normalized Zustand store**: `linesById`, `layersById`, `notesById`, `eventsById` plus ordered ID arrays. Edits go through commands (`addNote`, `moveEvents`, `addLayer`, …) that produce inverses for undo/redo.
- **Timing cache**: BPM segments with precomputed start seconds.
- **Channel caches**: per line × layer × channel, events with start/end seconds for binary-search evaluation.
- **Floor position cache**: prefix integral of the summed speed channel per line; note height = `floor(noteTime) − floor(now)`.
- **World transforms**: evaluate parents first (topological order from `parentId`).
- Invalidate caches per line on change, not globally.

## 9. Import / export (PCC only)

- **Chart file (`.pcc.json`)**: `{ format: 'phicreate-chart', version, meta, chart }`, no assets. Replaces the current `phicreate-project` JSON export (keep reading the old shape via migration).
- **Project package (`.pcproj`)**: zip (`fflate`) with `project.json` (same shape) and `assets/<assetId>.<ext>`.
- On import: parse → migrate → validate → `withDefaults()` → new project ID.

**Versioning**
- `chart.formatVersion` and `meta.schemaVersion` each have a `migrations: Record<number, (old) => new>` chain run on load.
- Validation: hand-written type guards (add a schema lib only if they get unwieldy), then invariants: sorted, non-overlapping events per channel; hold `endBeat > beat`; no parent cycles; at least one BPM point at beat 0. Fixable issues become warnings; unfixable ones reject the file.

## 10. Proposed file layout

```
src/features/chart/
  model/    types.ts, beat.ts, easing.ts, timing.ts, defaults.ts, invariants.ts
  runtime/  store.ts, commands.ts, caches.ts, evaluate.ts
  io/       serialize.ts, migrations.ts, validate.ts, pcproj.ts
src/features/assets/  assetRepo.ts, useAsset.ts
```

Leave room for `io/rpe/` later; nothing in the model should block it.

## 11. Implementation order

1. `beat.ts`, `easing.ts`, `timing.ts`, types, defaults; replace the `ChartData` stub (bump schema version, migrate existing empty charts).
2. DB v2: `assets`, `editorState`, `snapshots`; music/illustration upload on project creation.
3. Runtime store, commands, undo/redo, caches, `evaluate(line, t)` with layer summing.
4. PCC chart JSON + `.pcproj` import/export with migrations and validation.
5. Later: extended channels, note controls, textures, curve tracks.
6. Future: block areas.

## 12. Resolved decisions

- Scale is layered and additive (base 1, extra layers 0).
- Layer mute is editor-only session state.
- Base layer default speed is 10.

## Sources

- RPE format: <https://teamflos.github.io/phira-docs/chart-standard/chart-format/rpe/root.html> (plus `judgeLine`, `note`, `event`, `extendEvent`, `controls` pages)
- RPE Next: <https://github.com/kclg-YSJ/rpe-next>
- Official format (block areas): <https://teamflos.github.io/phira-docs/chart-standard/chart-format/phi/blockArea.html>
- phichain: <https://github.com/Ivan-1F/phichain> (`phichain-chart/src`)
