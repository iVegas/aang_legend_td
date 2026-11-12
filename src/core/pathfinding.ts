// Breadth-first distance field from the base cells. One pass serves every ground unit.

export const INF = 0xffff;

/** Neighbour order doubles as the deterministic tie-break: down, left, right, up. */
export function neighbours(cell: number, cols: number, rows: number, out: number[]): number[] {
  const x = cell % cols;
  const y = (cell - x) / cols;
  out[0] = y + 1 < rows ? cell + cols : -1;
  out[1] = x > 0 ? cell - 1 : -1;
  out[2] = x + 1 < cols ? cell + 1 : -1;
  out[3] = y > 0 ? cell - cols : -1;
  return out;
}

/**
 * @param blocked 1 where a cell cannot be walked
 * @param sources cells at distance 0 (the base)
 * @param out reused when provided
 */
export function computeDistanceField(
  cols: number,
  rows: number,
  blocked: Uint8Array,
  sources: number[],
  out?: Uint16Array,
): Uint16Array {
  const n = cols * rows;
  const dist = out ?? new Uint16Array(n);
  dist.fill(INF);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (const s of sources) {
    if (blocked[s]) continue;
    dist[s] = 0;
    queue[tail++] = s;
  }
  const nb = [0, 0, 0, 0];
  while (head < tail) {
    const cell = queue[head++];
    const d = dist[cell] + 1;
    neighbours(cell, cols, rows, nb);
    for (let i = 0; i < 4; i++) {
      const next = nb[i];
      if (next < 0 || blocked[next] || dist[next] !== INF) continue;
      dist[next] = d;
      queue[tail++] = next;
    }
  }
  return dist;
}

/** The neighbour a ground unit should step to: strictly closer to the base, first in order wins ties. */
export function stepToward(cell: number, cols: number, rows: number, dist: Uint16Array): number {
  const nb = neighbours(cell, cols, rows, [0, 0, 0, 0]);
  let best = cell;
  let bestD = dist[cell];
  for (let i = 0; i < 4; i++) {
    const n = nb[i];
    if (n >= 0 && dist[n] < bestD) {
      best = n;
      bestD = dist[n];
    }
  }
  return best;
}

/** The neighbour furthest from the base (used while a unit is being knocked back). */
export function stepAway(cell: number, cols: number, rows: number, dist: Uint16Array): number {
  const nb = neighbours(cell, cols, rows, [0, 0, 0, 0]);
  let best = cell;
  let bestD = dist[cell];
  for (let i = 0; i < 4; i++) {
    const n = nb[i];
    if (n >= 0 && dist[n] !== INF && dist[n] > bestD) {
      best = n;
      bestD = dist[n];
    }
  }
  return best;
}
