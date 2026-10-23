import { getAudioContext } from './audioContext';
import { getWaveform, type WaveformData } from './waveform';

// Music clock. Decoded Web Audio gives sample-accurate seeks; falls back to a wall clock without audio.
class Playback {
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private volume = 1;
  private ready: Promise<void> = Promise.resolve();
  private loadId = 0;
  private opId = 0;
  private playing = false;
  private rate = 1;
  // Song position at `stamp` (clock seconds).
  private base = 0;
  private stamp = 0;

  onEnded: (() => void) | null = null;
  onDuration: ((seconds: number) => void) | null = null;

  load(blob?: Blob) {
    this.unload();
    if (!blob) return;
    const id = this.loadId;
    this.ready = blob
      .arrayBuffer()
      .then((data) => getAudioContext().decodeAudioData(data))
      .then((buffer) => {
        if (id !== this.loadId) return;
        this.buffer = buffer;
        this.onDuration?.(buffer.duration);
      })
      .catch(() => undefined);
  }

  unload() {
    this.pause();
    this.loadId++;
    this.buffer = null;
    this.ready = Promise.resolve();
    this.base = 0;
  }

  get hasAudio() {
    return !!this.buffer;
  }

  getWaveform(): WaveformData | null {
    return this.buffer ? getWaveform(this.buffer) : null;
  }

  getAudioBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  get duration() {
    return this.buffer?.duration ?? 0;
  }

  private now() {
    return this.buffer ? getAudioContext().currentTime : performance.now() / 1000;
  }

  get time() {
    return this.playing ? this.base + (this.now() - this.stamp) * this.rate : this.base;
  }

  async play() {
    if (this.playing) return;
    const op = ++this.opId;
    await this.ready;
    if (this.buffer) await getAudioContext().resume();
    // Paused while waiting.
    if (op !== this.opId) throw new Error('Playback interrupted');
    if (this.buffer && this.base >= this.buffer.duration) this.base = 0;
    this.start();
    this.playing = true;
  }

  pause() {
    this.opId++;
    if (!this.playing) return;
    this.base = this.time;
    this.stop();
    this.playing = false;
  }

  seek(seconds: number) {
    const t = Math.max(0, seconds);
    this.base = this.buffer ? Math.min(t, this.buffer.duration) : t;
    if (this.playing) {
      this.stop();
      this.start();
    }
  }

  setVolume(volume: number) {
    this.volume = volume;
    if (this.gain) this.gain.gain.value = volume;
  }

  setRate(rate: number) {
    if (this.playing) {
      this.base = this.time;
      this.stamp = this.now();
    }
    this.rate = rate;
    if (this.source) this.source.playbackRate.value = rate;
  }

  private start() {
    this.stamp = this.now();
    if (!this.buffer) return;
    const ctx = getAudioContext();
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    // Speed shifts pitch.
    src.playbackRate.value = this.rate;
    if (!this.gain) {
      this.gain = ctx.createGain();
      this.gain.connect(ctx.destination);
    }
    this.gain.gain.value = this.volume;
    src.connect(this.gain);
    src.onended = () => {
      if (this.source !== src) return;
      this.source = null;
      this.playing = false;
      this.base = this.buffer?.duration ?? 0;
      this.onEnded?.();
    };
    src.start(this.stamp, this.base);
    this.source = src;
  }

  private stop() {
    const src = this.source;
    this.source = null;
    src?.stop();
    src?.disconnect();
  }
}

export const playback = new Playback();
