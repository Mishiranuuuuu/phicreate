let ctx: AudioContext | null = null;

// Shared by music and hitsounds so both run on one clock.
export function getAudioContext() {
  return (ctx ??= new AudioContext());
}
