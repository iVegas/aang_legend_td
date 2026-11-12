import { cellCenter, dist2 } from '../fixed';
import { neighbours } from '../pathfinding';
import { removeStructure, WALL, type GameState, type Structure, type Unit } from '../state';

function structureById(state: GameState, id: number): Structure | undefined {
  return id ? state.structures.find((s) => s.id === id) : undefined;
}

function hurt(state: GameState, s: Structure, amount: number, attacker: Unit): void {
  s.hp -= amount;
  if (s.kind !== WALL) return;
  const thorns = state.content.factions[state.player.faction].wall.thorns;
  if (thorns) {
    attacker.burnDmg = Math.max(attacker.burnDmg, thorns.dmg);
    attacker.burnTicks = Math.max(attacker.burnTicks, thorns.ticks);
  }
}

/** Unit abilities: shooting, trampling and breaching structures, and healing allies. */
export function abilitySystem(state: GameState): void {
  const { cols, rows } = state;
  const nb = [0, 0, 0, 0];
  let damaged = false;

  for (const u of state.units) {
    const ability = state.content.units[u.kind].ability;
    if (!ability || u.hp <= 0 || u.leaked) continue;
    if (u.abilityCd > 0) {
      u.abilityCd--;
      continue;
    }
    if (u.stunTicks > 0) continue;
    let used = false;

    switch (ability.type) {
      case 'ranged': {
        const r2 = ability.range * ability.range;
        let target: Structure | undefined;
        let best = 0;
        for (const s of state.structures) {
          if (s.hp <= 0 || (ability.targets === 'towers' && s.kind === WALL)) continue;
          const d2 = dist2(u.x, u.y, cellCenter(s.cell % cols), cellCenter(Math.floor(s.cell / cols)));
          if (d2 <= r2 && (!target || d2 < best)) {
            target = s;
            best = d2;
          }
        }
        if (target) {
          hurt(state, target, ability.damage, u);
          if (ability.jamPct && ability.jamTicks && target.kind !== WALL) {
            target.jamPct = Math.max(target.jamPct, ability.jamPct);
            target.jamTicks = Math.max(target.jamTicks, ability.jamTicks);
          }
          state.events.push({ type: 'unitShot', x: u.x, y: u.y, cell: target.cell, color: state.content.factions[state.content.units[u.kind].faction].color });
          used = true;
        }
        break;
      }
      case 'trample': {
        if (u.flying) break;
        neighbours(u.cell, cols, rows, nb);
        for (let i = 0; i < 4; i++) {
          const s = nb[i] >= 0 ? structureById(state, state.structAt[nb[i]]) : undefined;
          if (s && s.hp > 0) {
            hurt(state, s, ability.damage, u);
            state.events.push({ type: 'unitShot', x: u.x, y: u.y, cell: s.cell, color: 0xffffff });
            used = true;
          }
        }
        break;
      }
      case 'breach': {
        const s = u.next !== u.cell ? structureById(state, state.structAt[u.next]) : undefined;
        if (s && s.hp > 0 && u.pushTicks === 0) {
          hurt(state, s, ability.damage, u);
          state.events.push({ type: 'unitShot', x: u.x, y: u.y, cell: s.cell, color: 0xffffff });
          used = true;
        }
        break;
      }
      case 'heal': {
        const r2 = ability.range * ability.range;
        for (const ally of state.units) {
          if (ally === u || ally.hp <= 0 || ally.leaked || ally.hp >= ally.maxHp) continue;
          if (dist2(u.x, u.y, ally.x, ally.y) > r2) continue;
          ally.hp = Math.min(ally.maxHp, ally.hp + ability.amount);
          used = true;
        }
        if (used) state.events.push({ type: 'heal', x: u.x, y: u.y, range: ability.range });
        break;
      }
    }
    if (used) {
      u.abilityCd = ability.cooldown;
      damaged = true;
    }
  }

  if (!damaged) return;
  // Remove whatever was destroyed; each removal re-routes the board.
  for (let i = state.structures.length - 1; i >= 0; i--) {
    const s = state.structures[i];
    if (s.hp > 0) continue;
    state.events.push({ type: 'destroyed', cell: s.cell });
    removeStructure(state, s);
  }
}
