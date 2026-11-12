// Rules shared by the client and the verification server.

/** Fastest game speed the client offers; the server uses it to bound how quickly a match can be played. */
export const MAX_SPEED = 2;
export const TICK_MS = 50;

export function starsFor(baseHp: number, baseMaxHp: number): number {
  if (baseHp <= 0) return 0;
  const pct = Math.floor((baseHp * 100) / baseMaxHp);
  return pct >= 80 ? 3 : pct >= 40 ? 2 : 1;
}
