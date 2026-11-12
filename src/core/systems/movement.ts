import { cellCenter } from '../fixed';
import { stepAway, stepToward } from '../pathfinding';
import { Cell, type GameState, type Unit } from '../state';

const PUSH_SPEED = 128; // 2.5 cells per second
const BURN_INTERVAL = 10;
const STUN_IMMUNITY = 30;
const PUSH_IMMUNITY = 50;

function chooseNext(state: GameState, u: Unit, pushed: boolean): void {
  const { cols, rows } = state;
  if (u.flying) {
    const row = Math.floor(u.cell / cols);
    if (pushed) u.next = row > 0 ? u.cell - cols : u.cell;
    else u.next = row < rows - 1 ? u.cell + cols : u.cell;
  } else {
    u.next = pushed ? stepAway(u.cell, cols, rows, state.dist) : stepToward(u.cell, cols, rows, state.dist);
  }
}

export function movementSystem(state: GameState): void {
  const { cols } = state;
  for (const u of state.units) {
    u.px = u.x;
    u.py = u.y;

    if (u.burnTicks > 0) {
      u.burnTicks--;
      if (u.burnTicks % BURN_INTERVAL === 0) u.hp -= u.burnDmg;
      if (u.hp <= 0) continue;
    }
    if (u.stunTicks > 0) {
      if (--u.stunTicks === 0) u.stunImmune = STUN_IMMUNITY;
      continue;
    }
    if (u.stunImmune > 0) u.stunImmune--;

    let speed = state.content.units[u.kind].speed;
    if (u.slowTicks > 0) {
      u.slowTicks--;
      speed = Math.max(1, Math.floor((speed * (100 - u.slowPct)) / 100));
    }
    const pushed = u.pushTicks > 0;
    if (pushed) {
      speed = PUSH_SPEED;
      if (--u.pushTicks === 0) u.pushImmune = PUSH_IMMUNITY;
    } else if (u.pushImmune > 0) {
      u.pushImmune--;
    }

    // Units only ever travel along one axis between two cell centres.
    let budget = speed;
    for (let guard = 0; guard < 4 && budget > 0; guard++) {
      if (u.next === u.cell) {
        chooseNext(state, u, pushed);
        if (u.next === u.cell) break;
      }
      const tx = cellCenter(u.next % cols);
      const ty = cellCenter(Math.floor(u.next / cols));
      const d = Math.abs(tx - u.x) + Math.abs(ty - u.y);
      if (d > budget) {
        u.x += Math.sign(tx - u.x) * budget;
        u.y += Math.sign(ty - u.y) * budget;
        break;
      }
      u.x = tx;
      u.y = ty;
      budget -= d;
      u.cell = u.next;
      if (!pushed && state.cells[u.cell] === Cell.Base) {
        u.leaked = true;
        break;
      }
      chooseNext(state, u, pushed);
    }
  }
}
