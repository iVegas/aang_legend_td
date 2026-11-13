import { useEffect, useState } from 'preact/hooks';
import type { FactionId, TargetingMode } from '../content';
import type { Outcome } from '../core';

export interface BuildItem {
  kind: string;
  name: string;
  blurb: string;
  stats: string;
  cost: number;
  color: number;
  /** Why it cannot be built here right now, or null when it can. */
  blocked: string | null;
}

/** What the contextual menu knows about the structure on its cell. */
export interface StructureInfo {
  name: string;
  blurb: string;
  isWall: boolean;
  tier: number;
  stats: string;
  hp: number;
  maxHp: number;
  targeting: TargetingMode;
  upgradeCost: number | null;
  canUpgrade: boolean;
  /** 0 when undamaged. */
  repairCost: number;
  canRepair: boolean;
  sellValue: number;
}

/** Contextual menu anchored to a board cell. */
export interface CellMenu {
  cell: number;
  /** Cell rectangle in viewport pixels. */
  x: number;
  y: number;
  size: number;
  /** Things that can be built on this cell: everything on free ground, towers only on a wall. */
  items: BuildItem[];
  structure: StructureInfo | null;
}

export interface Hud {
  levelName: string;
  hint: string;
  supplies: number;
  baseHp: number;
  baseMax: number;
  wave: number;
  waves: number;
  waveActive: boolean;
  /** Seconds until the next wave starts by itself; -1 while waiting for the player. */
  countdown: number;
  outcome: Outcome;
  stars: number;
  hasNext: boolean;
  speed: number;
  /** Seconds of 3× burst remaining, 0 when not bursting. */
  burst: number;
  paused: boolean;
  menu: CellMenu | null;
}

export type Screen = 'splash' | 'home' | 'nations' | 'levels' | 'game';
export type VerifyStatus = 'none' | 'local' | 'pending' | 'verified' | 'rejected' | 'queued';

export interface AppState {
  screen: Screen;
  faction: FactionId | null;
  /** Best stars per `${faction}:${levelId}`. */
  progress: Record<string, number>;
  muted: boolean;
  vibration: boolean;
  /** Whether this device can vibrate at all; the setting is hidden when it cannot. */
  canVibrate: boolean;
  settingsOpen: boolean;
  /** Multiplayer appears on the home screen once both single-player sides are completed. */
  multiplayerUnlocked: boolean;
  resume: { levelId: string; faction: FactionId } | null;
  hud: Hud | null;
  toast: string | null;
  updateReady: boolean;
  /** Server-verified stars per `${faction}:${levelId}`. */
  verified: Record<string, number>;
  /** Verification status of the match that just ended. */
  verify: VerifyStatus;
}

let state: AppState = {
  screen: 'splash',
  faction: null,
  progress: {},
  muted: false,
  vibration: true,
  canVibrate: false,
  settingsOpen: false,
  multiplayerUnlocked: false,
  resume: null,
  hud: null,
  toast: null,
  updateReady: false,
  verified: {},
  verify: 'none',
};
const listeners = new Set<() => void>();

export const getState = () => state;

export function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useAppState(): AppState {
  const [snapshot, set] = useState(state);
  useEffect(() => {
    const l = () => set(state);
    listeners.add(l);
    l();
    return () => void listeners.delete(l);
  }, []);
  return snapshot;
}
