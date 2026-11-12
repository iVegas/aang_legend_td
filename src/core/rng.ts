// Seeded PRNG (mulberry32). The whole generator state is one uint32 kept in GameState.

export interface RngHolder {
  rng: number;
}

export function nextU32(s: RngHolder): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Uniform integer in [0, n). */
export function nextInt(s: RngHolder, n: number): number {
  return nextU32(s) % n;
}
