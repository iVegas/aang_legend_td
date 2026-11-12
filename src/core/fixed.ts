// Fixed-point helpers. All simulation distances are integers; 1024 units = one cell.

export const ONE = 1024;
export const HALF = ONE / 2;
export const TICKS_PER_SECOND = 20;

export const cellCenter = (index: number) => index * ONE + HALF;

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Integer square root (floor). Exact for the magnitudes used on any board. */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let x = Math.floor(Math.sqrt(n));
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}
