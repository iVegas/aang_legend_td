import { describe, expect, it } from 'vitest';
import { content, FACTION_ORDER } from '../src/content';
import {
  applyCommand, checkPlace, computeDistanceField, createState, hashState, INF, sellValue, step, stepToward, WALL,
} from '../src/core';
import { nextInt } from '../src/core/rng';
import { replay, runBot } from './bot';

const fresh = (level = 'open_field', seed = 1) => createState(content, level, 'water', seed);

describe('content', () => {
  it('is internally consistent', () => {
    for (const f of Object.values(content.factions)) {
      for (const t of f.towers) expect(content.towers[t].faction).toBe(f.id);
      for (const u of Object.values(f.units)) expect(content.units[u].faction).toBe(f.id);
    }
    for (const level of content.levels) {
      expect(() => createState(content, level.id, 'fire', 1)).not.toThrow();
      const s = createState(content, level.id, 'fire', 1);
      for (const spawn of s.spawnCells) expect(s.dist[spawn]).not.toBe(INF);
    }
  });
});

describe('pathfinding', () => {
  it('measures distance on an open board', () => {
    const s = fresh();
    expect(s.dist[0]).toBe(s.rows - 1);
    expect(s.dist[s.baseCells[0]]).toBe(0);
  });

  it('routes around a wall and breaks ties deterministically', () => {
    const s = fresh();
    s.player.supplies = 1000;
    // Wall off row 5 except the last column.
    for (let x = 0; x < s.cols - 1; x++) {
      expect(applyCommand(s, { type: 'placeStructure', kind: WALL, cell: 5 * s.cols + x })).toBe(true);
    }
    expect(s.dist[4 * s.cols]).toBe(s.cols - 1 + 10);
    expect(stepToward(4 * s.cols, s.cols, s.rows, s.dist)).toBe(4 * s.cols + 1);
  });

  it('never accepts a build that seals the path (random boards)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = fresh('broken_pass', seed);
      s.player.supplies = 1e6;
      const r = { rng: seed };
      for (let i = 0; i < 200; i++) {
        applyCommand(s, { type: 'placeStructure', kind: WALL, cell: nextInt(r, s.cells.length) });
      }
      const blocked = new Uint8Array(s.cells.length);
      for (let i = 0; i < blocked.length; i++) blocked[i] = s.cells[i] === 3 || s.structAt[i] ? 1 : 0;
      const dist = computeDistanceField(s.cols, s.rows, blocked, s.baseCells);
      for (const spawn of s.spawnCells) expect(dist[spawn]).not.toBe(INF);
      expect(Array.from(dist)).toEqual(Array.from(s.dist));
    }
  });
});

describe('commands', () => {
  it('rejects invalid placements with a reason', () => {
    const s = fresh();
    expect(checkPlace(s, WALL, 0)).toBe('terrain');
    expect(checkPlace(s, WALL, -1)).toBe('bounds');
    expect(checkPlace(s, 'rock_slinger', 20)).toBe('unknown'); // not a Water tower
    expect(checkPlace(s, WALL, 20)).toBeNull();
    applyCommand(s, { type: 'placeStructure', kind: WALL, cell: 20 });
    expect(checkPlace(s, WALL, 20)).toBe('occupied');
    s.player.supplies = 0;
    expect(checkPlace(s, WALL, 21)).toBe('funds');
  });

  it('refuses to seal the last gap', () => {
    const s = fresh();
    s.player.supplies = 1000;
    for (let x = 0; x < s.cols - 1; x++) applyCommand(s, { type: 'placeStructure', kind: WALL, cell: 5 * s.cols + x });
    expect(checkPlace(s, WALL, 5 * s.cols + s.cols - 1)).toBe('sealed');
  });

  it('charges, upgrades and refunds', () => {
    const s = fresh();
    const start = s.player.supplies;
    applyCommand(s, { type: 'placeStructure', kind: 'water_whip', cell: 30 });
    expect(s.player.supplies).toBe(start - 30);
    s.player.supplies = 100;
    expect(applyCommand(s, { type: 'upgradeTower', cell: 30 })).toBe(true);
    expect(s.structures[0].tier).toBe(1);
    expect(sellValue(s, 30)).toBe(Math.floor((65 * 70) / 100));
    applyCommand(s, { type: 'sellStructure', cell: 30 });
    expect(s.structures.length).toBe(0);
    expect(s.structAt[30]).toBe(0);
  });

  it('will not build under a walking unit', () => {
    const s = fresh();
    step(s, [{ type: 'startWave' }]);
    while (s.units.length === 0) step(s, []);
    for (let i = 0; i < 30; i++) step(s, []);
    const u = s.units[0];
    expect(checkPlace(s, WALL, u.next)).toMatch(/unit|terrain/);
  });
});

describe('simulation', () => {
  it('lets undefended units reach the base and lose the match', () => {
    const s = fresh('first_steps');
    step(s, [{ type: 'startWave' }]);
    for (let i = 0; i < 20000 && s.outcome === 'playing'; i++) step(s, s.wave.active ? [] : [{ type: 'startWave' }]);
    expect(s.outcome).toBe('lost');
    expect(s.player.baseHp).toBe(0);
  });

  it('towers kill units and pay bounties', () => {
    const s = fresh('first_steps');
    s.player.supplies = 10000;
    for (const cell of [3 * 7 + 2, 3 * 7 + 4, 5 * 7 + 2, 5 * 7 + 4, 7 * 7 + 2, 7 * 7 + 4]) {
      expect(applyCommand(s, { type: 'placeStructure', kind: 'water_whip', cell })).toBe(true);
    }
    const before = s.player.supplies;
    step(s, [{ type: 'startWave' }]);
    while (s.wave.active) step(s, []);
    expect(s.player.kills).toBe(6);
    expect(s.player.baseHp).toBe(s.player.baseMaxHp);
    expect(s.player.supplies).toBeGreaterThan(before);
  });

  it('is deterministic: same seed and commands give identical hashes', () => {
    const a = runBot('open_field', 'fire', 42);
    const b = runBot('open_field', 'fire', 42);
    expect(a.hashes).toEqual(b.hashes);
    expect(a.state.outcome).not.toBe('playing');
    const c = runBot('open_field', 'fire', 43);
    expect(c.hashes).not.toEqual(a.hashes);
  });

  it('replays from the command log alone', () => {
    const a = runBot('broken_pass', 'air', 7);
    expect(replay('broken_pass', 'air', 7, a.log, a.state.tick)).toEqual(a.hashes);
  });

  it('keeps hashing stable across every faction and level', () => {
    for (const level of content.levels) {
      for (const faction of FACTION_ORDER) {
        const run = runBot(level.id, faction, 5);
        expect(run.state.outcome).not.toBe('playing');
        expect(hashState(run.state)).toBe(run.hashes[run.hashes.length - 1]);
      }
    }
  });
});
