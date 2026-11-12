import type { GameState } from './state';

/** FNV-1a over every value that influences the future of the match. */
export function hashState(state: GameState): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h ^= v & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (v >>> 8) & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (v >>> 16) & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (v >>> 24) & 0xff; h = Math.imul(h, 0x01000193);
  };
  const mixStr = (s: string) => {
    for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i));
  };
  mix(state.tick); mix(state.rng); mix(state.nextId);
  mix(state.player.supplies); mix(state.player.baseHp); mix(state.player.kills);
  mix(state.wave.index); mix(state.wave.active ? 1 : 0); mix(state.wave.timer); mix(state.wave.queue.length);
  mixStr(state.outcome);
  for (const s of state.structures) {
    mix(s.id); mixStr(s.kind); mix(s.cell); mix(s.tier); mix(s.cooldown); mixStr(s.targeting); mix(s.spent);
    mix(s.hp); mix(s.maxHp); mix(s.jamTicks); mix(s.jamPct);
  }
  for (const u of state.units) {
    mix(u.id); mixStr(u.kind); mix(u.x); mix(u.y); mix(u.cell); mix(u.next); mix(u.hp);
    mix(u.slowPct); mix(u.slowTicks); mix(u.stunTicks); mix(u.stunImmune);
    mix(u.burnDmg); mix(u.burnTicks); mix(u.pushTicks); mix(u.pushImmune); mix(u.abilityCd);
  }
  for (const p of state.projectiles) {
    mix(p.id); mix(p.x); mix(p.y); mix(p.target); mix(p.tx); mix(p.ty);
  }
  return h >>> 0;
}
