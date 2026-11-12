import { expect, it } from 'vitest';
import { hashState, WALL } from '../src/core';
import { Session, TICK_MS } from '../src/game/session';

it('restores a saved match by replaying its command log', () => {
  const a = new Session('open_field', 'earth', 99);
  a.issue({ type: 'placeStructure', kind: 'rock_slinger', cell: 40 });
  a.issue({ type: 'placeStructure', kind: WALL, cell: 41 });
  a.advance(TICK_MS, () => {});
  a.issue({ type: 'startWave' });
  for (let i = 0; i < 300; i++) a.advance(TICK_MS, () => {});
  expect(a.state.units.length).toBeGreaterThan(0);

  const saved = JSON.parse(JSON.stringify(a.toSave()));
  const b = Session.restore(saved)!;
  expect(b.state.tick).toBe(a.state.tick);
  expect(hashState(b.state)).toBe(hashState(a.state));
  expect(b.paused).toBe(true);

  expect(Session.restore({ ...saved, contentVersion: 'other' })).toBeNull();
});

it('does not fast-forward after a long pause between frames', () => {
  const s = new Session('open_field', 'earth', 1);
  s.advance(60_000, () => {});
  expect(s.state.tick).toBeLessThanOrEqual(5);
});
