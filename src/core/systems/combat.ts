import type { StatusEffectDef, TowerDef, TowerTierDef } from '../../content/types';
import { cellCenter, dist2, isqrt, ONE } from '../fixed';
import { compact, WALL, type GameState, type Structure, type Unit } from '../state';

const CHAIN_FALLOFF_PCT = 75;

function damage(u: Unit, amount: number, def: TowerDef, armor: number): void {
  let a = amount;
  if (u.flying && def.vsFlyingPct) a = Math.floor((a * def.vsFlyingPct) / 100);
  u.hp -= Math.max(1, a - armor);
}

function applyEffects(u: Unit, effects: StatusEffectDef[] | undefined, structAt: Int32Array): void {
  if (!effects) return;
  for (const e of effects) {
    switch (e.type) {
      case 'slow':
        if (u.slowTicks === 0 || e.pct >= u.slowPct) {
          u.slowPct = e.pct;
          u.slowTicks = e.ticks;
        }
        break;
      case 'stun':
        if (u.stunTicks === 0 && u.stunImmune === 0) u.stunTicks = e.ticks;
        break;
      case 'burn':
        u.burnDmg = Math.max(u.burnDmg, e.dmg);
        u.burnTicks = Math.max(u.burnTicks, e.ticks);
        break;
      case 'knockback':
        if (u.pushTicks === 0 && u.pushImmune === 0) {
          u.pushTicks = e.ticks;
          // Turn around on the spot: head back to the cell just left.
          // (Unless it is facing a structure it was breaking through: then it just backs off.)
          if (structAt[u.next] === 0) {
            const from = u.cell;
            u.cell = u.next;
            u.next = from;
          }
        }
        break;
    }
  }
}

function strike(state: GameState, u: Unit, amount: number, def: TowerDef, tier: TowerTierDef): void {
  damage(u, amount, def, state.content.units[u.kind].armor);
  applyEffects(u, tier.effects, state.structAt);
}

/** Fixed-point distance a unit still has to travel to the base; lower means further along. */
function remaining(state: GameState, u: Unit): number {
  if (u.flying) return cellCenter(state.rows - 1) - u.y;
  const tx = cellCenter(u.next % state.cols);
  const ty = cellCenter(Math.floor(u.next / state.cols));
  // A unit about to break through a structure is measured from where it stands.
  const cells = state.structAt[u.next] !== 0 ? state.dist[u.cell] : state.dist[u.next];
  return cells * ONE + Math.abs(tx - u.x) + Math.abs(ty - u.y);
}

function canTarget(def: TowerDef, u: Unit): boolean {
  return u.hp > 0 && !u.leaked && (def.hitsFlying || !u.flying);
}

function pickTarget(state: GameState, s: Structure, def: TowerDef, tier: TowerTierDef, x: number, y: number): Unit | undefined {
  const r2 = tier.range * tier.range;
  const min2 = (def.minRange ?? 0) * (def.minRange ?? 0);
  let best: Unit | undefined;
  let bestScore = 0;
  for (const u of state.units) {
    if (!canTarget(def, u)) continue;
    const d2 = dist2(x, y, u.x, u.y);
    if (d2 > r2 || d2 < min2) continue;
    // Lower score wins; strict comparison keeps the earliest unit on ties.
    const score = s.targeting === 'first' ? remaining(state, u) : s.targeting === 'strongest' ? -u.hp : d2;
    if (!best || score < bestScore) {
      best = u;
      bestScore = score;
    }
  }
  return best;
}

export function towerSystem(state: GameState): void {
  const { cols } = state;
  for (const s of state.structures) {
    if (s.kind === WALL) continue;
    if (s.jamTicks > 0) s.jamTicks--;
    if (s.cooldown > 0 && --s.cooldown > 0) continue;
    const def = state.content.towers[s.kind];
    const tier = def.tiers[s.tier];
    const x = cellCenter(s.cell % cols);
    const y = cellCenter(Math.floor(s.cell / cols));

    if (def.attack === 'pulse') {
      const r2 = tier.range * tier.range;
      let any = false;
      for (const u of state.units) {
        if (!canTarget(def, u) || dist2(x, y, u.x, u.y) > r2) continue;
        strike(state, u, tier.damage, def, tier);
        any = true;
      }
      if (!any) continue;
      state.events.push({ type: 'pulse', cell: s.cell, range: tier.range, color: def.color });
    } else {
      const target = pickTarget(state, s, def, tier, x, y);
      if (!target) continue;
      if (def.attack === 'chain') {
        const points = [x, y, target.x, target.y];
        const hit = [target.id];
        let amount = tier.damage;
        let from = target;
        strike(state, target, amount, def, tier);
        const jump2 = (tier.radius ?? 0) * (tier.radius ?? 0);
        for (let j = 0; j < (tier.jumps ?? 0); j++) {
          let next: Unit | undefined;
          let nextD = 0;
          for (const u of state.units) {
            if (!canTarget(def, u) || hit.includes(u.id)) continue;
            const d2 = dist2(from.x, from.y, u.x, u.y);
            if (d2 <= jump2 && (!next || d2 < nextD)) {
              next = u;
              nextD = d2;
            }
          }
          if (!next) break;
          amount = Math.floor((amount * CHAIN_FALLOFF_PCT) / 100);
          strike(state, next, amount, def, tier);
          hit.push(next.id);
          points.push(next.x, next.y);
          from = next;
        }
        state.events.push({ type: 'chain', points });
      } else {
        state.projectiles.push({
          id: state.nextId++, tower: s.kind, tier: s.tier,
          x, y, px: x, py: y, target: target.id, tx: target.x, ty: target.y,
        });
        state.events.push({ type: 'shot', cell: s.cell });
      }
    }
    s.cooldown = s.jamTicks > 0 ? Math.floor((tier.cooldown * (100 + s.jamPct)) / 100) : tier.cooldown;
  }
}

export function projectileSystem(state: GameState): void {
  if (state.projectiles.length === 0) return;
  for (const p of state.projectiles) {
    p.px = p.x;
    p.py = p.y;
    const def = state.content.towers[p.tower];
    const tier = def.tiers[p.tier];
    let target: Unit | undefined;
    if (p.target) {
      target = state.units.find((u) => u.id === p.target);
      if (target && target.hp > 0 && !target.leaked) {
        p.tx = target.x;
        p.ty = target.y;
      } else {
        target = undefined;
        p.target = 0;
      }
    }
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = isqrt(dx * dx + dy * dy);
    if (d > def.projectileSpeed) {
      p.x += Math.trunc((dx * def.projectileSpeed) / d);
      p.y += Math.trunc((dy * def.projectileSpeed) / d);
      continue;
    }
    // Impact.
    p.x = p.tx;
    p.y = p.ty;
    if (def.attack === 'splash') {
      const r2 = (tier.radius ?? 0) * (tier.radius ?? 0);
      for (const u of state.units) {
        if (canTarget(def, u) && dist2(p.x, p.y, u.x, u.y) <= r2) strike(state, u, tier.damage, def, tier);
      }
    } else if (target) {
      strike(state, target, tier.damage, def, tier);
    }
    state.events.push({ type: 'hit', x: p.x, y: p.y, radius: tier.radius ?? 0, color: def.color });
    p.tier = -1;
  }
  compact(state.projectiles, (p) => p.tier >= 0);
}

/** Pays bounties, applies base damage, removes dead and leaked units, decides defeat. */
export function resolveSystem(state: GameState): void {
  let changed = false;
  for (const u of state.units) {
    if (u.leaked) {
      changed = true;
      state.player.baseHp = Math.max(0, state.player.baseHp - state.content.units[u.kind].damage);
      state.events.push({ type: 'leak', x: u.x, y: u.y });
    } else if (u.hp <= 0) {
      changed = true;
      state.player.supplies += state.content.units[u.kind].bounty;
      state.player.kills++;
      state.events.push({ type: 'died', x: u.x, y: u.y });
    }
  }
  if (changed) compact(state.units, (u) => !u.leaked && u.hp > 0);
  if (state.player.baseHp <= 0 && state.outcome === 'playing') {
    state.outcome = 'lost';
    state.events.push({ type: 'outcome', outcome: 'lost' });
  }
}
