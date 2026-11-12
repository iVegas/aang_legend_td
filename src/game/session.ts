import { content, type FactionId } from '../content';
import { createState, step, type Command, type GameState, type SimEvent } from '../core';

export const TICK_MS = 50;
const MAX_FRAME_MS = 250;

export interface LoggedCommand {
  tick: number;
  cmd: Command;
}

/** Everything needed to rebuild a match: the simulation is deterministic, so the log is the save file. */
export interface SavedMatch {
  contentVersion: string;
  levelId: string;
  faction: FactionId;
  seed: number;
  tick: number;
  log: LoggedCommand[];
}

/** Owns one match: feeds commands into the simulation on a fixed timestep and records them. */
export class Session {
  readonly state: GameState;
  readonly log: LoggedCommand[] = [];
  speed = 1;
  paused = false;
  /** Fraction of a tick elapsed since the last step, for render interpolation. */
  alpha = 0;
  private pending: Command[] = [];
  private acc = 0;

  constructor(
    readonly levelId: string,
    readonly faction: FactionId,
    readonly seed: number,
  ) {
    this.state = createState(content, levelId, faction, seed);
  }

  static restore(save: SavedMatch): Session | null {
    if (save.contentVersion !== content.version) return null;
    try {
      const session = new Session(save.levelId, save.faction, save.seed);
      let i = 0;
      while (session.state.tick < save.tick && session.state.outcome === 'playing') {
        const cmds: Command[] = [];
        while (i < save.log.length && save.log[i].tick === session.state.tick + 1) cmds.push(save.log[i++].cmd);
        for (const cmd of cmds) session.log.push({ tick: session.state.tick + 1, cmd });
        step(session.state, cmds);
      }
      session.state.events.length = 0;
      session.paused = true;
      return session;
    } catch {
      return null;
    }
  }

  issue(cmd: Command): void {
    this.pending.push(cmd);
  }

  toSave(): SavedMatch {
    return {
      contentVersion: content.version,
      levelId: this.levelId,
      faction: this.faction,
      seed: this.seed,
      tick: this.state.tick,
      log: this.log.slice(),
    };
  }

  /** Runs as many fixed ticks as the elapsed real time calls for. */
  advance(dtMs: number, onEvent: (e: SimEvent) => void): void {
    if (this.paused || this.state.outcome !== 'playing') {
      this.alpha = 1;
      return;
    }
    // Clamp so a backgrounded tab does not fast-forward the match on return.
    this.acc += Math.min(dtMs, MAX_FRAME_MS) * this.speed;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      const cmds = this.pending;
      this.pending = [];
      for (const cmd of cmds) this.log.push({ tick: this.state.tick + 1, cmd });
      step(this.state, cmds);
      for (const e of this.state.events) onEvent(e);
      if (this.state.outcome !== 'playing') {
        this.acc = 0;
        break;
      }
    }
    this.alpha = this.acc / TICK_MS;
  }
}
