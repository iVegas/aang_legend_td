import { describe, expect, it } from 'vitest';
import { content, type FactionId } from '../src/content';
import { applyCommand, createState, repairCost, sellValue, step, structureAt, WALL, type GameState } from '../src/core';
import { spawnUnit } from '../src/core/systems/waves';

const COLS = 9;
const at = (x: number, y: number) => y * COLS + x;

function setup(faction: FactionId): GameState {
  const s = createState(content, 'open_field', faction, 1);
  s.player.supplies = 100000;
  return s;
}
const place = (s: GameState, kind: string, cell: number) => expect(applyCommand(s, { type: 'placeStructure', kind, cell })).toBe(true);
const run = (s: GameState, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(s, []);
};

describe('phase 2: destructible structures', () => {
  it('siege units shoot structures down and the board re-routes', () => {
    const s = setup('water');
    place(s, WALL, at(3, 3));
    const version = s.gridVersion;
    spawnUnit(s, 'siege_tank', at(4, 0), 100);
    run(s, 400);
    expect(structureAt(s, at(3, 3))).toBeUndefined();
    expect(s.gridVersion).toBeGreaterThan(version);
    expect(s.wallAt[at(3, 3)]).toBe(0);
  });

  it('repair restores health for a price; damage lowers sell value', () => {
    const s = setup('water');
    place(s, 'water_whip', at(4, 5));
    const tower = structureAt(s, at(4, 5))!;
    expect(repairCost(s, tower.cell)).toBe(0);
    const fullSell = sellValue(s, tower.cell);
    tower.hp = tower.maxHp / 2;
    expect(sellValue(s, tower.cell)).toBe(Math.floor(fullSell / 2));
    const cost = repairCost(s, tower.cell);
    expect(cost).toBe(Math.ceil((30 * 60) / 200));
    const before = s.player.supplies;
    expect(applyCommand(s, { type: 'repairStructure', cell: tower.cell })).toBe(true);
    expect(tower.hp).toBe(tower.maxHp);
    expect(s.player.supplies).toBe(before - cost);
    expect(applyCommand(s, { type: 'repairStructure', cell: tower.cell })).toBe(false);
  });

  it('upgrading raises maximum health without healing damage', () => {
    const s = setup('water');
    place(s, 'water_whip', at(4, 5));
    const tower = structureAt(s, at(4, 5))!;
    tower.hp -= 50;
    applyCommand(s, { type: 'upgradeTower', cell: tower.cell });
    expect(tower.maxHp).toBe(224);
    expect(tower.hp).toBe(224 - 50);
  });

  it('a breaching unit goes through a wall line instead of around it', () => {
    const s = setup('water');
    // Wall row with the only gap at the far right; the badgermole starts at the far left.
    for (let x = 0; x < COLS - 1; x++) place(s, WALL, at(x, 6));
    spawnUnit(s, 'badgermole', at(0, 0), 100);
    const walls = s.structures.length;
    run(s, 900);
    expect(s.structures.length).toBe(walls - 1);
    expect(structureAt(s, at(0, 6))).toBeUndefined();
    // It never took the long way round.
    expect(s.units.every((u) => u.x < 2 * 1024)).toBe(true);
  });

  it('building is still possible while a breaching unit is chewing on a wall', () => {
    const s2 = setup('water');
    for (let x = 0; x < COLS - 1; x++) place(s2, WALL, at(x, 6));
    spawnUnit(s2, 'badgermole', at(0, 0), 100);
    while (s2.units[0].next === s2.units[0].cell || s2.structAt[s2.units[0].next] === 0) step(s2, []);
    const wall = structureAt(s2, s2.units[0].next)!;
    run(s2, 25);
    expect(wall.hp).toBeLessThan(wall.maxHp);
    place(s2, WALL, at(4, 9));
  });

  it('harassers jam towers, healers heal', () => {
    const s = setup('water');
    place(s, 'water_whip', at(4, 4));
    const tower = structureAt(s, at(4, 4))!;
    spawnUnit(s, 'firebender', at(4, 0), 100000);
    run(s, 120);
    expect(tower.jamTicks).toBeGreaterThan(0);
    expect(tower.hp).toBeLessThan(tower.maxHp);

    const f = setup('fire');
    spawnUnit(f, 'waterbender', at(4, 0), 100);
    spawnUnit(f, 'tribal_warrior', at(4, 0), 100);
    f.units[1].hp = 10;
    run(f, 60);
    expect(f.units[1].hp).toBeGreaterThan(10);
  });

  it('ice walls slow passers-by and iron walls burn their attackers', () => {
    const w = setup('water');
    place(w, WALL, at(3, 3));
    spawnUnit(w, 'fire_soldier', at(4, 0), 100);
    let slowed = false;
    for (let i = 0; i < 100; i++) {
      step(w, []);
      slowed ||= w.units[0]?.slowTicks > 0;
    }
    expect(slowed).toBe(true);

    const f = setup('fire');
    place(f, WALL, at(3, 3));
    spawnUnit(f, 'ice_ram', at(4, 0), 100);
    let burned = false;
    for (let i = 0; i < 200; i++) {
      step(f, []);
      burned ||= f.units[0]?.burnTicks > 0;
    }
    expect(burned).toBe(true);
  });
});
