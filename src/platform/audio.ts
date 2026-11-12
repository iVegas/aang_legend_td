// Tiny synthesised sound effects: no audio assets to download.

type Sound = 'place' | 'sell' | 'upgrade' | 'shot' | 'pulse' | 'zap' | 'die' | 'leak' | 'wave' | 'win' | 'lose' | 'deny';

const RECIPES: Record<Sound, { type: OscillatorType; from: number; to: number; dur: number; gain: number }> = {
  place: { type: 'triangle', from: 320, to: 480, dur: 0.08, gain: 0.25 },
  sell: { type: 'triangle', from: 480, to: 240, dur: 0.1, gain: 0.2 },
  upgrade: { type: 'triangle', from: 440, to: 880, dur: 0.16, gain: 0.25 },
  shot: { type: 'square', from: 660, to: 330, dur: 0.04, gain: 0.05 },
  pulse: { type: 'sine', from: 180, to: 60, dur: 0.18, gain: 0.2 },
  zap: { type: 'sawtooth', from: 1200, to: 300, dur: 0.07, gain: 0.07 },
  die: { type: 'square', from: 220, to: 90, dur: 0.07, gain: 0.07 },
  leak: { type: 'sawtooth', from: 160, to: 70, dur: 0.3, gain: 0.3 },
  wave: { type: 'sine', from: 392, to: 587, dur: 0.25, gain: 0.25 },
  win: { type: 'triangle', from: 523, to: 1046, dur: 0.6, gain: 0.3 },
  lose: { type: 'sawtooth', from: 300, to: 80, dur: 0.7, gain: 0.3 },
  deny: { type: 'square', from: 140, to: 120, dur: 0.1, gain: 0.12 },
};

let ctx: AudioContext | undefined;
let muted = false;
const lastPlayed: Partial<Record<Sound, number>> = {};

export function setMuted(value: boolean): void {
  muted = value;
}

/** Browsers only allow audio after a user gesture; call this from the first tap. */
export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* audio unavailable */
  }
}

export function play(sound: Sound): void {
  if (muted || !ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  // Rate-limit so a busy fight does not turn into noise.
  if (now - (lastPlayed[sound] ?? -1) < 0.05) return;
  lastPlayed[sound] = now;
  const r = RECIPES[sound];
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = r.type;
  osc.frequency.setValueAtTime(r.from, now);
  osc.frequency.exponentialRampToValueAtTime(r.to, now + r.dur);
  gain.gain.setValueAtTime(r.gain, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + r.dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + r.dur + 0.02);
}
