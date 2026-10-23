// Extracts downsampled peak data from an AudioBuffer for timeline waveform rendering.

export interface WaveformData {
  duration: number;
  binsPerSecond: number;
  peaks: Float32Array;
  sampleAt: (timeSeconds: number) => number;
}

const BINS_PER_SECOND = 120;
const cache = new WeakMap<AudioBuffer, WaveformData>();

export function getWaveform(buffer: AudioBuffer): WaveformData {
  const existing = cache.get(buffer);
  if (existing) return existing;

  const duration = buffer.duration;
  const totalBins = Math.max(1, Math.ceil(duration * BINS_PER_SECOND));
  const peaks = new Float32Array(totalBins);
  const sampleRate = buffer.sampleRate;
  const channelCount = buffer.numberOfChannels;
  const samplesPerBin = Math.max(1, Math.floor(sampleRate / BINS_PER_SECOND));

  const channels: Float32Array[] = [];
  for (let c = 0; c < channelCount; c++) {
    channels.push(buffer.getChannelData(c));
  }

  const length = buffer.length;
  for (let b = 0; b < totalBins; b++) {
    const start = b * samplesPerBin;
    const end = Math.min(length, start + samplesPerBin);
    let max = 0;
    for (let c = 0; c < channelCount; c++) {
      const data = channels[c];
      for (let i = start; i < end; i += 2) {
        const v = Math.abs(data[i]);
        if (v > max) max = v;
      }
    }
    peaks[b] = Math.min(1, max);
  }

  const sampleAt = (time: number): number => {
    if (time < 0 || time > duration) return 0;
    const index = Math.floor(time * BINS_PER_SECOND);
    if (index < 0 || index >= totalBins) return 0;
    return peaks[index];
  };

  const data: WaveformData = { duration, binsPerSecond: BINS_PER_SECOND, peaks, sampleAt };
  cache.set(buffer, data);
  return data;
}
