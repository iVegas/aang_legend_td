import { factions, towers, units } from './factions';
import { levels } from './levels';
import type { ContentPack, FactionId } from './types';

export * from './types';

/** Bump whenever a change to data would alter the outcome of a recorded match. */
export const content: ContentPack = {
  version: '0.2.0',
  factions,
  towers,
  units,
  levels,
};

export const FACTION_ORDER: FactionId[] = ['water', 'earth', 'fire', 'air'];

/** The three factions that attack a player of the given faction, in fixed order. */
export function enemiesOf(faction: FactionId): FactionId[] {
  return FACTION_ORDER.filter((f) => f !== faction);
}
