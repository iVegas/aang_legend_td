import { content, type FactionId, type TargetingMode } from '../content';
import {
  checkPlace, ONE, sellValue, structureAt, structureCost, TARGETING_MODES, TICKS_PER_SECOND, upgradeCost, WALL,
  type PlaceError, type SimEvent,
} from '../core';
import { play, setMuted, unlockAudio } from '../platform/audio';
import { load, remove, save } from '../platform/storage';
import { Renderer } from '../render/renderer';
import { getState, setState, type Hud, type Selection } from '../ui/store';
import { Session, type SavedMatch } from './session';

// Glue between the simulation, the renderer, input and the HUD store.

const SAVE_KEY = 'match';
const PROGRESS_KEY = 'progress';
const SETTINGS_KEY = 'settings';

const REASONS: Record<PlaceError, string | null> = {
  over: null,
  bounds: null,
  unknown: null,
  occupied: null,
  terrain: "Can't build there",
  unit: 'An enemy is in the way',
  funds: 'Not enough supplies',
  sealed: 'That would seal the path',
};

let renderer: Renderer | null = null;
let session: Session | null = null;
let tool: string | null = null;
let selected = -1;
let raf = 0;
let lastFrame = 0;
let lastHudKey = '';
let toastTimer = 0;
let pointerDown = false;
let wakeLock: { release(): Promise<void> } | null = null;

export const progressKey = (faction: FactionId, levelId: string) => `${faction}:${levelId}`;

export async function boot(host: HTMLElement): Promise<void> {
  const [progress, settings, saved] = await Promise.all([
    load<Record<string, number>>(PROGRESS_KEY),
    load<{ muted: boolean; faction: FactionId | null }>(SETTINGS_KEY),
    load<SavedMatch>(SAVE_KEY),
  ]);
  setMuted(settings?.muted ?? false);
  setState({
    progress: progress ?? {},
    muted: settings?.muted ?? false,
    faction: settings?.faction ?? null,
    resume: saved && saved.contentVersion === content.version ? { levelId: saved.levelId, faction: saved.faction } : null,
  });

  renderer = await Renderer.create(host);
  const canvas = renderer.canvas;
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerLeave);
  canvas.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('resize', () => renderer?.layout());
  new ResizeObserver(() => renderer?.layout()).observe(host);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && session && session.state.outcome === 'playing') {
      session.paused = true;
      void persist();
    }
  });
}

// ── Menu-level actions ──────────────────────────────────────────────────

function saveSettings(): void {
  const { muted, faction } = getState();
  void save(SETTINGS_KEY, { muted, faction });
}

export function chooseFaction(faction: FactionId | null): void {
  setState({ faction });
  saveSettings();
}

export function toggleMute(): void {
  const muted = !getState().muted;
  setMuted(muted);
  setState({ muted });
  saveSettings();
}

export function startLevel(levelId: string, faction: FactionId): void {
  unlockAudio();
  void remove(SAVE_KEY);
  setState({ resume: null });
  begin(new Session(levelId, faction, (Math.random() * 0x100000000) >>> 0));
}

export async function resumeSaved(): Promise<void> {
  unlockAudio();
  const saved = await load<SavedMatch>(SAVE_KEY);
  const restored = saved && Session.restore(saved);
  if (!restored) {
    void remove(SAVE_KEY);
    setState({ resume: null });
    toast('Saved match could not be restored');
    return;
  }
  begin(restored);
}

export function exitToMenu(): void {
  cancelAnimationFrame(raf);
  if (session && session.state.outcome === 'playing' && session.state.tick > 0) {
    void persist();
    setState({ resume: { levelId: session.levelId, faction: session.faction } });
  }
  session = null;
  renderer?.setState(null);
  void wakeLock?.release().catch(() => {});
  wakeLock = null;
  setState({ screen: 'menu', hud: null });
}

function begin(s: Session): void {
  session = s;
  tool = null;
  selected = -1;
  lastHudKey = '';
  setState({ screen: 'game', faction: s.faction });
  // The canvas host only gets its size once the game screen is laid out.
  requestAnimationFrame(() => {
    renderer?.setState(s.state);
    lastFrame = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  });
  void requestWakeLock();
}

async function requestWakeLock(): Promise<void> {
  try {
    wakeLock = (await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null;
  }
}

function persist(): Promise<void> {
  return session ? save(SAVE_KEY, session.toSave()) : Promise.resolve();
}

// ── Frame loop ──────────────────────────────────────────────────────────

function loop(now: number): void {
  raf = requestAnimationFrame(loop);
  if (!session || !renderer) return;
  const dt = now - lastFrame;
  lastFrame = now;
  session.advance(dt, onSimEvent);
  if (selected >= 0 && !structureAt(session.state, selected)) selected = -1;
  renderer.overlay.selected = selected;
  renderer.frame(session.alpha, dt);
  publishHud();
}

function onSimEvent(e: SimEvent): void {
  renderer?.onEvent(e);
  switch (e.type) {
    case 'placed': play('place'); break;
    case 'sold': play('sell'); break;
    case 'upgraded': play('upgrade'); break;
    case 'shot': play('shot'); break;
    case 'pulse': play('pulse'); break;
    case 'chain': play('zap'); break;
    case 'died': play('die'); break;
    case 'leak':
      play('leak');
      navigator.vibrate?.(40);
      break;
    case 'waveStart': play('wave'); break;
    case 'waveCleared':
      // Wave boundaries are the autosave points.
      if (session?.state.outcome === 'playing') void persist();
      break;
    case 'outcome':
      play(e.outcome === 'won' ? 'win' : 'lose');
      finish();
      break;
  }
}

function starsFor(baseHp: number, baseMax: number): number {
  const pct = (baseHp * 100) / baseMax;
  return pct >= 80 ? 3 : pct >= 40 ? 2 : 1;
}

function finish(): void {
  if (!session) return;
  void remove(SAVE_KEY);
  setState({ resume: null });
  const { state } = session;
  if (state.outcome !== 'won') return;
  const key = progressKey(session.faction, session.levelId);
  const stars = starsFor(state.player.baseHp, state.player.baseMaxHp);
  const progress = { ...getState().progress };
  if ((progress[key] ?? 0) < stars) {
    progress[key] = stars;
    setState({ progress });
    void save(PROGRESS_KEY, progress);
    void navigator.storage?.persist?.();
  }
}

function describe(kind: string, tier: number): string {
  if (kind === WALL) return 'Blocks the path';
  const def = content.towers[kind];
  const t = def.tiers[tier];
  const rate = (TICKS_PER_SECOND / t.cooldown).toFixed(1);
  return `Dmg ${t.damage} · Range ${(t.range / ONE).toFixed(1)} · ${rate}/s`;
}

function publishHud(): void {
  if (!session) return;
  const { state } = session;
  const faction = content.factions[state.player.faction];
  const levelIndex = content.levels.findIndex((l) => l.id === session!.levelId);

  let selection: Selection | null = null;
  const st = selected >= 0 ? structureAt(state, selected) : undefined;
  if (st) {
    const cost = upgradeCost(state, st.cell) ?? null;
    selection = {
      cell: st.cell,
      name: st.kind === WALL ? faction.wall.name : content.towers[st.kind].name,
      isWall: st.kind === WALL,
      tier: st.tier,
      stats: describe(st.kind, st.tier),
      upgradeCost: cost,
      canUpgrade: cost !== null && state.player.supplies >= cost,
      sellValue: sellValue(state, st.cell),
      targeting: st.targeting,
    };
  }

  const hud: Hud = {
    levelName: state.level.name,
    hint: state.level.hint ?? '',
    supplies: state.player.supplies,
    baseHp: state.player.baseHp,
    baseMax: state.player.baseMaxHp,
    wave: state.wave.index,
    waves: state.level.waves.length,
    waveActive: state.wave.active,
    countdown: state.wave.timer > 0 ? Math.ceil(state.wave.timer / TICKS_PER_SECOND) : -1,
    outcome: state.outcome,
    stars: state.outcome === 'won' ? starsFor(state.player.baseHp, state.player.baseMaxHp) : 0,
    hasNext: levelIndex >= 0 && levelIndex < content.levels.length - 1,
    speed: session.speed,
    paused: session.paused,
    tool,
    items: [
      { kind: WALL, name: faction.wall.name, blurb: 'Blocks the path', cost: faction.wall.cost, color: faction.wall.color, affordable: state.player.supplies >= faction.wall.cost },
      ...faction.towers.map((id) => {
        const def = content.towers[id];
        return { kind: id, name: def.name, blurb: def.blurb, cost: def.tiers[0].cost, color: def.color, affordable: state.player.supplies >= def.tiers[0].cost };
      }),
    ],
    selection,
  };
  const key = JSON.stringify(hud);
  if (key !== lastHudKey) {
    lastHudKey = key;
    setState({ hud });
  }
}

export function toast(message: string): void {
  setState({ toast: message });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => setState({ toast: null }), 1600);
}

// ── In-game actions ─────────────────────────────────────────────────────

export function selectTool(kind: string | null): void {
  tool = tool === kind ? null : kind;
  selected = -1;
  if (renderer) renderer.overlay.hover = -1;
}

export function deselect(): void {
  selected = -1;
}

export function startWave(): void {
  if (!session) return;
  session.paused = false;
  session.issue({ type: 'startWave' });
}

export function togglePause(): void {
  if (session) session.paused = !session.paused;
}

export function toggleSpeed(): void {
  if (session) session.speed = session.speed === 1 ? 2 : 1;
}

export function upgradeSelected(): void {
  if (session && selected >= 0) session.issue({ type: 'upgradeTower', cell: selected });
}

export function sellSelected(): void {
  if (session && selected >= 0) session.issue({ type: 'sellStructure', cell: selected });
  selected = -1;
}

export function cycleTargeting(): void {
  if (!session || selected < 0) return;
  const st = structureAt(session.state, selected);
  if (!st) return;
  const mode: TargetingMode = TARGETING_MODES[(TARGETING_MODES.indexOf(st.targeting) + 1) % TARGETING_MODES.length];
  session.issue({ type: 'setTargeting', cell: selected, mode });
}

export function retry(): void {
  if (session) startLevel(session.levelId, session.faction);
}

export function nextLevel(): void {
  if (!session) return;
  const i = content.levels.findIndex((l) => l.id === session!.levelId);
  const next = content.levels[i + 1];
  if (next) startLevel(next.id, session.faction);
}

// ── Pointer input ───────────────────────────────────────────────────────

function tryPlace(cell: number, quiet: boolean): void {
  if (!session || !renderer || !tool || cell < 0) return;
  const error = checkPlace(session.state, tool, cell);
  if (error === null) {
    session.issue({ type: 'placeStructure', kind: tool, cell });
    return;
  }
  if (quiet) return;
  renderer.reject(cell);
  play('deny');
  const reason = REASONS[error];
  if (reason) toast(reason);
}

function updateHover(cell: number): void {
  if (!session || !renderer) return;
  const o = renderer.overlay;
  if (!tool || cell < 0 || structureAt(session.state, cell)) {
    o.hover = -1;
    return;
  }
  o.hover = cell;
  o.hoverValid = checkPlace(session.state, tool, cell) === null;
  o.hoverRange = tool === WALL || structureCost(session.state, tool) === undefined ? 0 : content.towers[tool].tiers[0].range;
}

function onPointerDown(e: PointerEvent): void {
  if (!session || !renderer || session.state.outcome !== 'playing') return;
  unlockAudio();
  const cell = renderer.cellAt(e.clientX, e.clientY);
  pointerDown = true;
  renderer.canvas.setPointerCapture?.(e.pointerId);
  const existing = cell >= 0 ? structureAt(session.state, cell) : undefined;
  if (existing) {
    selected = existing.cell;
    pointerDown = false;
    renderer.overlay.hover = -1;
    return;
  }
  selected = -1;
  if (!tool) return;
  // Walls paint immediately so a drag lays a line; towers wait for release so the
  // range preview can be dragged into position first.
  if (tool === WALL) tryPlace(cell, false);
  updateHover(cell);
}

function onPointerMove(e: PointerEvent): void {
  if (!session || !renderer || !tool) return;
  if (e.pointerType !== 'mouse' && !pointerDown) return;
  const cell = renderer.cellAt(e.clientX, e.clientY);
  if (pointerDown && tool === WALL && cell !== renderer.overlay.hover) tryPlace(cell, true);
  updateHover(cell);
}

function onPointerUp(e: PointerEvent): void {
  if (!session || !renderer) return;
  if (pointerDown && tool && tool !== WALL) tryPlace(renderer.cellAt(e.clientX, e.clientY), false);
  pointerDown = false;
  if (e.pointerType !== 'mouse') renderer.overlay.hover = -1;
}

function onPointerLeave(): void {
  pointerDown = false;
  if (renderer) renderer.overlay.hover = -1;
}
