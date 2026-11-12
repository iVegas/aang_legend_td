import { useEffect, useState } from 'preact/hooks';
import type { FactionId, TargetingMode } from '../content';
import type { Outcome } from '../core';

export interface BuildItem {
  kind: string;
  name: string;
  blurb: string;
  cost: number;
  color: number;
  affordable: boolean;
}

export interface Selection {
  cell: number;
  name: string;
  isWall: boolean;
  tier: number;
  stats: string;
  upgradeCost: number | null;
  canUpgrade: boolean;
  sellValue: number;
  hp: number;
  maxHp: number;
  /** 0 when undamaged. */
  repairCost: number;
  canRepair: boolean;
  targeting: TargetingMode;
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
  paused: boolean;
  tool: string | null;
  items: BuildItem[];
  selection: Selection | null;
}

export interface AppState {
  screen: 'menu' | 'game';
  faction: FactionId | null;
  /** Best stars per `${faction}:${levelId}`. */
  progress: Record<string, number>;
  muted: boolean;
  resume: { levelId: string; faction: FactionId } | null;
  hud: Hud | null;
  toast: string | null;
  updateReady: boolean;
  /** Server-verified stars per `${faction}:${levelId}`. */
  verified: Record<string, number>;
  /** Verification status of the match that just ended. */
  verify: VerifyStatus;
}

export type VerifyStatus = 'none' | 'local' | 'pending' | 'verified' | 'rejected' | 'queued';

let state: AppState = {
  screen: 'menu',
  faction: null,
  progress: {},
  muted: false,
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
