import type { MediaKind } from '@/features/chart/model/types';
import { forgetFrame } from './frameCache';

// Decoded media object files, keyed by asset id.

interface GifFrame {
  image: ImageBitmap;
  // Cumulative end time (seconds).
  end: number;
}

export interface LoadedMedia {
  kind: MediaKind;
  width: number;
  height: number;
  // Seconds; 0 for still images.
  duration: number;
  image?: ImageBitmap;
  frames?: GifFrame[];
  video?: HTMLVideoElement;
  scrub?: VideoScrub;
}

// Stand-in frames shown while a video seek decodes.
interface CachedFrame {
  time: number;
  image: ImageBitmap;
  bytes: number;
}

interface VideoScrub {
  // Downscaled recent frames, sorted by time.
  cache: CachedFrame[];
  capturing: boolean;
  // Full-size frame from just before the current seek.
  held: HTMLCanvasElement | null;
  heldTime: number;
  // Target from the previous frame, to tell scrubbing from a settled playhead.
  lastPos: number;
  // Draw frame that last synced the video, and its target; later users that frame don't seek.
  syncedFrame: number;
  syncedPos: number;
  released: boolean;
}

// Min spacing between cached frames (seconds), their max side (px) and the total byte budget.
const CACHE_STEP = 0.1;
const CACHE_MAX_SIDE = 640;
const CACHE_BUDGET = 160 * 1024 * 1024;

// Cached frames across videos, oldest first.
const cacheOrder: { scrub: VideoScrub; frame: CachedFrame }[] = [];
let cacheBytes = 0;

const loaded = new Map<string, LoadedMedia>();
const pending = new Map<string, Promise<LoadedMedia | null>>();
let generation = 0;
let drawFrame = 0;

export const MEDIA_ACCEPT = 'image/*,video/*';

export const mediaKindOf = (type: string): MediaKind | null =>
  type === 'image/gif'
    ? 'gif'
    : type.startsWith('image/')
      ? 'image'
      : type.startsWith('video/')
        ? 'video'
        : null;

export const getMedia = (assetId: string | null) => (assetId ? loaded.get(assetId) : undefined);

export function loadMedia(assetId: string, blob: Blob): Promise<LoadedMedia | null> {
  const done = loaded.get(assetId);
  if (done) return Promise.resolve(done);
  let promise = pending.get(assetId);
  if (!promise) {
    const id = generation;
    promise = decode(blob)
      .catch(() => null)
      .then((media) => {
        if (!media) return null;
        // Cleared while decoding.
        if (id !== generation) {
          release(media);
          return null;
        }
        pending.delete(assetId);
        loaded.set(assetId, media);
        return media;
      });
    pending.set(assetId, promise);
  }
  return promise;
}

async function decode(blob: Blob): Promise<LoadedMedia | null> {
  const kind = mediaKindOf(blob.type);
  if (kind === 'video') return decodeVideo(blob);
  if (!kind) return null;
  const image = await createImageBitmap(blob);
  const base = { kind, width: image.width, height: image.height, duration: 0, image };
  if (kind !== 'gif') return base;
  const frames = await decodeGif(blob);
  // No ImageDecoder: shows the first frame.
  if (!frames?.length) return base;
  return { ...base, frames, duration: frames[frames.length - 1].end };
}

async function decodeGif(blob: Blob): Promise<GifFrame[] | null> {
  if (typeof ImageDecoder === 'undefined') return null;
  try {
    const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type });
    await decoder.completed;
    const count = decoder.tracks.selectedTrack?.frameCount ?? 1;
    const frames: GifFrame[] = [];
    let end = 0;
    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      // Browsers play very short GIF delays at 100 ms.
      const d = (image.duration ?? 0) / 1e6;
      end += d > 0.01 ? d : 0.1;
      frames.push({ image: await createImageBitmap(image), end });
      image.close();
    }
    decoder.close();
    return frames;
  } catch {
    return null;
  }
}

async function decodeVideo(blob: Blob): Promise<LoadedMedia> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = URL.createObjectURL(blob);
  try {
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = reject;
    });
  } catch (e) {
    URL.revokeObjectURL(video.src);
    throw e;
  }
  const scrub: VideoScrub = {
    cache: [],
    capturing: false,
    held: null,
    heldTime: 0,
    lastPos: NaN,
    syncedFrame: -1,
    syncedPos: 0,
    released: false,
  };
  return {
    kind: 'video',
    width: video.videoWidth,
    height: video.videoHeight,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    video,
    scrub,
  };
}

// Index of the cached frame closest to t, or -1.
function nearest(cache: CachedFrame[], t: number) {
  let lo = 0;
  let hi = cache.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cache[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && (lo === cache.length || t - cache[lo - 1].time < cache[lo].time - t)) lo--;
  return cache.length ? lo : -1;
}

function capture(video: HTMLVideoElement, scrub: VideoScrub, time: number) {
  const i = nearest(scrub.cache, time);
  if (scrub.capturing || (i >= 0 && Math.abs(scrub.cache[i].time - time) < CACHE_STEP)) return;
  const k = Math.min(1, CACHE_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
  const w = Math.max(1, Math.round(video.videoWidth * k));
  const h = Math.max(1, Math.round(video.videoHeight * k));
  scrub.capturing = true;
  createImageBitmap(video, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' })
    .then((image) => {
      if (scrub.released) return image.close();
      const frame = { time, image, bytes: w * h * 4 };
      const at = scrub.cache.findIndex((f) => f.time > time);
      scrub.cache.splice(at < 0 ? scrub.cache.length : at, 0, frame);
      cacheOrder.push({ scrub, frame });
      cacheBytes += frame.bytes;
      while (cacheBytes > CACHE_BUDGET && cacheOrder.length) evict(cacheOrder.shift()!);
    })
    .catch(() => undefined)
    .finally(() => (scrub.capturing = false));
}

function evict({ scrub, frame }: (typeof cacheOrder)[number]) {
  const i = scrub.cache.indexOf(frame);
  if (i >= 0) scrub.cache.splice(i, 1);
  frame.image.close();
  cacheBytes -= frame.bytes;
}

// Best frame to show while the video can't draw: the cached or held frame closest to pos.
function standIn(scrub: VideoScrub, pos: number): CanvasImageSource | null {
  const i = nearest(scrub.cache, pos);
  const cached = i >= 0 ? scrub.cache[i] : null;
  if (cached && (!scrub.held || Math.abs(cached.time - pos) < Math.abs(scrub.heldTime - pos)))
    return cached.image;
  return scrub.held;
}

// Keeps the shown frame before seeking, so the preview never blanks mid-seek.
function seekVideo(video: HTMLVideoElement, scrub: VideoScrub, pos: number) {
  if (!video.seeking && video.readyState >= 2) {
    scrub.held ??= document.createElement('canvas');
    if (scrub.held.width !== video.videoWidth || scrub.held.height !== video.videoHeight) {
      scrub.held.width = video.videoWidth;
      scrub.held.height = video.videoHeight;
    }
    scrub.held.getContext('2d')!.drawImage(video, 0, 0);
    scrub.heldTime = video.currentTime;
  }
  video.currentTime = pos;
}

// Media position for a time since start (null = not started: first frame).
function position(media: LoadedMedia, time: number | null, loop: boolean) {
  const d = media.duration;
  if (time === null || d <= 0) return 0;
  if (loop) return ((time % d) + d) % d;
  return Math.min(Math.max(time, 0), d);
}

// Frame to draw; also keeps a video element in sync with the chart clock.
export function mediaFrame(
  media: LoadedMedia,
  time: number | null,
  loop: boolean,
  playing: boolean,
  rate: number,
): CanvasImageSource | null {
  const pos = position(media, time, loop);
  if (media.frames) {
    const { frames } = media;
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].end <= pos) lo = mid + 1;
      else hi = mid;
    }
    return frames[lo].image;
  }
  if (media.video && media.scrub) {
    const { video, scrub } = media;
    // Objects sharing a video at other times show a stand-in rather than seeking it every frame.
    if (scrub.syncedFrame === drawFrame && Math.abs(pos - scrub.syncedPos) > MAX_DRIFT)
      return standIn(scrub, pos) ?? (video.seeking || video.readyState < 2 ? null : video);
    scrub.syncedFrame = drawFrame;
    scrub.syncedPos = pos;
    syncVideo(
      video,
      scrub,
      media.duration,
      pos,
      loop,
      playing && time !== null && (loop || time < media.duration),
      rate,
    );
    if (video.seeking || video.readyState < 2) return standIn(scrub, pos);
    capture(video, scrub, video.currentTime);
    return video;
  }
  return media.image ?? null;
}

const MAX_DRIFT = 0.25;

function syncVideo(
  video: HTMLVideoElement,
  scrub: VideoScrub,
  duration: number,
  pos: number,
  loop: boolean,
  active: boolean,
  rate: number,
) {
  video.loop = loop;
  let drift = Math.abs(video.currentTime - pos);
  if (loop && duration > 0) drift = Math.min(drift, duration - drift);
  const moving = pos !== scrub.lastPos;
  scrub.lastPos = pos;
  if (active) {
    video.playbackRate = rate;
    if (video.paused) void video.play().catch(() => undefined);
    if (drift > MAX_DRIFT) seekVideo(video, scrub, pos);
    return;
  }
  if (!video.paused) video.pause();
  // While scrubbing, seeks finish for feedback; once the playhead settles, retarget at once.
  if (drift > 0.001 && (!video.seeking || !moving)) seekVideo(video, scrub, pos);
}

// Call once per drawn frame, before any mediaFrame.
export function beginMediaFrame() {
  drawFrame++;
}

export function pauseAllMedia() {
  for (const m of loaded.values()) m.video?.pause();
}

function release(media: LoadedMedia) {
  for (const src of [media.image, media.video, ...(media.frames ?? []).map((f) => f.image)])
    if (src) forgetFrame(src);
  media.image?.close();
  for (const f of media.frames ?? []) f.image.close();
  if (media.scrub) {
    media.scrub.released = true;
    for (const entry of cacheOrder.filter((e) => e.scrub === media.scrub)) {
      cacheOrder.splice(cacheOrder.indexOf(entry), 1);
      evict(entry);
    }
    media.scrub.held = null;
  }
  if (media.video) {
    media.video.pause();
    URL.revokeObjectURL(media.video.src);
    media.video.removeAttribute('src');
  }
}

// Drops one decoded file (replaced or deleted).
export function unloadMedia(assetId: string) {
  const media = loaded.get(assetId);
  if (media) release(media);
  loaded.delete(assetId);
  pending.delete(assetId);
}

export function clearMedia() {
  generation++;
  for (const m of loaded.values()) release(m);
  loaded.clear();
  pending.clear();
}
