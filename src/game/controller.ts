import { content, type FactionId, type TargetingMode } from '../content';
import {
  Cell, checkPlace, ONE, repairCost, sellValue, starsFor, structureAt, TARGETING_MODES, TICKS_PER_SECOND, upgradeCost, WALL,
  type PlaceError, type SimEvent,
} from '../core';
import * as api from '../platform/api';
import { play, setMuted, unlockAudio } from '../platform/audio';
import { load, remove, save } from '../platform/storage';
import { Renderer } from '../render/renderer';
import { getState, setState, type BuildItem, type CellMenu, type Hud, type Screen, type StructureInfo } from '../ui/store';
import { Session, type SavedMatch } from './session';

// Glue between the simulation, the renderer, input and the HUD store.

const SAVE_KEY = 'match';
const PROGRESS_KEY = 'progress';
const SETTINGS_KEY = 'settings';

const REASONS: Record<PlaceError, string> = {
  over: 'The match is over',
  bounds: "Can't build there",
  unknown: "Can't build that",
  occupied: 'Already built on',
  terrain: "Can't build there",
  unit: 'An enemy is in the way',
  funds: 'Not enough supplies',
  sealed: 'That would seal the path',
};

interface Settings {
  muted: boolean;
  vibration: boolean;
  faction: FactionId | null;
}

let renderer: Renderer | null = null;
let session: Session | null = null;
/** Cell the contextual menu is open on, or -1. */
let menuCell = -1;
/** Whether that cell held a structure when the menu opened, so the menu closes if it is destroyed. */
let menuOnStructure = false;
/** Build option being held for details; its range is previewed on the board. */
let heldKind: string | null = null;
let raf = 0;
let lastFrame = 0;
let lastHudKey = '';
let toastTimer = 0;
let wakeLock: { release(): Promise<void> } | null = null;
let starting = false;
/** Speed to return to when the 3× burst runs out, and how much of it is left. */
let baseSpeed = 1;
let burstLeftMs = 0;
let lastTapCell = -1;
let lastTapAt = 0;

const BURST_SPEED = 3;
const BURST_MS = 5000;
const DOUBLE_TAP_MS = 350;

export const progressKey = (faction: FactionId, levelId: string) => `${faction}:${levelId}`;

export async function boot(host: HTMLElement): Promise<void> {
  const [progress, settings, saved] = await Promise.all([
    load<Record<string, number>>(PROGRESS_KEY),
    load<Partial<Settings>>(SETTINGS_KEY),
    load<SavedMatch>(SAVE_KEY),
  ]);
  setMuted(settings?.muted ?? false);
  setState({
    progress: progress ?? {},
    muted: settings?.muted ?? false,
    vibration: settings?.vibration ?? true,
    canVibrate: typeof navigator.vibrate === 'function',
    faction: settings?.faction ?? null,
    resume: saved && saved.contentVersion === content.version ? { levelId: saved.levelId, faction: saved.faction } : null,
  });

  void refreshVerified();

  renderer = await Renderer.create(host);
  renderer.canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('resize', () => renderer?.layout());
  new ResizeObserver(() => renderer?.layout()).observe(host);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && session && session.state.outcome === 'playing') {
      session.paused = true;
      void persist();
    }
  });
}

// ── Navigation and settings ─────────────────────────────────────────────

export function goTo(screen: Screen): void {
  unlockAudio();
  setState({ screen });
}

function saveSettings(): void {
  const { muted, vibration, faction } = getState();
  void save(SETTINGS_KEY, { muted, vibration, faction } satisfies Settings);
}

export function chooseFaction(faction: FactionId): void {
  setState({ faction, screen: 'home' });
  saveSettings();
}

export function openSettings(open: boolean): void {
  setState({ settingsOpen: open });
}

export function toggleMute(): void {
  const muted = !getState().muted;
  setMuted(muted);
  setState({ muted });
  saveSettings();
  if (!muted) {
    unlockAudio();
    play('place');
  }
}

export function toggleVibration(): void {
  const vibration = !getState().vibration;
  setState({ vibration });
  saveSettings();
  if (vibration) vibrate(40);
}

function vibrate(ms: number): void {
  if (getState().vibration) navigator.vibrate?.(ms);
}

async function refreshVerified(): Promise<void> {
  await api.flushPending();
  const verified = await api.fetchVerified();
  if (verified) setState({ verified });
}

// ── Match lifecycle ─────────────────────────────────────────────────────

export async function startLevel(levelId: string, faction: FactionId): Promise<void> {
  if (starting) return;
  starting = true;
  unlockAudio();
  void remove(SAVE_KEY);
  setState({ resume: null });
  try {
    // Online, the server picks the seed so the result can be verified later.
    // Offline, the level starts anyway and the result stays local.
    const attempt = await api.startAttempt(levelId, faction);
    begin(new Session(levelId, faction, attempt?.seed ?? (Math.random() * 0x100000000) >>> 0, attempt?.attemptId));
  } finally {
    starting = false;
  }
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
  setState({ screen: 'home', hud: null, settingsOpen: false });
}

function begin(s: Session): void {
  session = s;
  menuCell = -1;
  heldKind = null;
  baseSpeed = 1;
  burstLeftMs = 0;
  lastHudKey = '';
  setState({ screen: 'game', faction: s.faction, verify: 'none', settingsOpen: false });
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
  if (burstLeftMs > 0 && !session.paused) {
    burstLeftMs -= dt;
    if (burstLeftMs <= 0) {
      burstLeftMs = 0;
      session.speed = baseSpeed;
    }
  }
  session.advance(dt, onSimEvent);

  const { state } = session;
  const onStructure = menuCell >= 0 && !!structureAt(state, menuCell);
  // The structure the menu was about is gone (destroyed or sold): nothing left to act on.
  if (menuCell >= 0 && (state.outcome !== 'playing' || (menuOnStructure && !onStructure))) closeMenu();

  const o = renderer.overlay;
  o.selected = onStructure ? menuCell : -1;
  const building = menuCell >= 0 && (!onStructure || state.wallAt[menuCell] === 1);
  o.hover = building && (!onStructure || heldKind) ? menuCell : -1;
  o.hoverValid = !heldKind || checkPlace(state, heldKind, menuCell) === null;
  o.hoverRange = heldKind && heldKind !== WALL ? content.towers[heldKind].tiers[0].range : 0;

  renderer.frame(session.alpha, dt);
  publishHud();
}

function onSimEvent(e: SimEvent): void {
  renderer?.onEvent(e);
  switch (e.type) {
    case 'placed': play('place'); break;
    case 'sold': play('sell'); break;
    case 'upgraded': play('upgrade'); break;
    case 'repaired': play('upgrade'); break;
    case 'unitShot': play('shot'); break;
    case 'destroyed':
      play('leak');
      vibrate(25);
      break;
    case 'shot': play('shot'); break;
    case 'pulse': play('pulse'); break;
    case 'chain': play('zap'); break;
    case 'died': play('die'); break;
    case 'leak':
      play('leak');
      vibrate(40);
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

function finish(): void {
  if (!session) return;
  void remove(SAVE_KEY);
  setState({ resume: null });
  const { state } = session;
  void verify(session);
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

/** Sends the match's inputs to the server, which replays them and records its own verdict. */
async function verify(s: Session): Promise<void> {
  if (!s.attemptId) {
    setState({ verify: api.apiEnabled ? 'local' : 'none' });
    return;
  }
  setState({ verify: 'pending' });
  const result = await api.submitResult({ attemptId: s.attemptId, tick: s.state.tick, log: s.log });
  if (result.status === 'verified' && result.stars > 0) {
    const key = progressKey(s.faction, s.levelId);
    const verified = { ...getState().verified };
    verified[key] = Math.max(verified[key] ?? 0, result.stars);
    setState({ verified });
  }
  // Only report on the match still on screen.
  if (session === s) setState({ verify: result.status === 'offline' ? 'queued' : result.status });
}

// ── HUD ─────────────────────────────────────────────────────────────────

function describe(kind: string, tier: number): string {
  if (kind === WALL) return 'Blocks the path';
  const def = content.towers[kind];
  const t = def.tiers[tier];
  const rate = (TICKS_PER_SECOND / t.cooldown).toFixed(1);
  return `Dmg ${t.damage} · Range ${(t.range / ONE).toFixed(1)} · ${rate}/s`;
}

function buildMenu(): CellMenu | null {
  if (!session || !renderer || menuCell < 0) return null;
  const rect = renderer.cellRect(menuCell);
  if (!rect) return null;
  const { state } = session;
  const faction = content.factions[state.player.faction];
  const st = structureAt(state, menuCell);

  const option = (kind: string, name: string, blurb: string, cost: number, color: number): BuildItem => {
    const error = checkPlace(state, kind, menuCell);
    return { kind, name, blurb, stats: describe(kind, 0), cost, color, blocked: error ? REASONS[error] : null };
  };
  const items: BuildItem[] = [];
  if (!st) items.push(option(WALL, faction.wall.name, 'Blocks the path', faction.wall.cost, faction.wall.color));
  if (!st || st.kind === WALL) {
    for (const id of faction.towers) {
      const def = content.towers[id];
      items.push(option(id, def.name, def.blurb, def.tiers[0].cost, def.color));
    }
  }

  let structure: StructureInfo | null = null;
  if (st) {
    const isWall = st.kind === WALL;
    const upgrade = upgradeCost(state, st.cell) ?? null;
    const repair = repairCost(state, st.cell);
    structure = {
      name: isWall ? faction.wall.name : content.towers[st.kind].name,
      blurb: isWall ? 'Blocks the path' : content.towers[st.kind].blurb,
      isWall,
      tier: st.tier,
      stats: describe(st.kind, st.tier),
      hp: st.hp,
      maxHp: st.maxHp,
      targeting: st.targeting,
      upgradeCost: upgrade,
      canUpgrade: upgrade !== null && state.player.supplies >= upgrade,
      repairCost: repair,
      canRepair: repair > 0 && state.player.supplies >= repair,
      sellValue: sellValue(state, st.cell),
    };
  }
  return { cell: menuCell, ...rect, items, structure };
}

function publishHud(): void {
  if (!session) return;
  const { state } = session;
  const levelIndex = content.levels.findIndex((l) => l.id === session!.levelId);
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
    burst: Math.ceil(burstLeftMs / 1000),
    paused: session.paused,
    menu: buildMenu(),
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

export function closeMenu(): void {
  menuCell = -1;
  heldKind = null;
}

/** Builds from the contextual menu, or explains why it cannot. */
export function build(kind: string): void {
  if (!session || !renderer || menuCell < 0) return;
  const error = checkPlace(session.state, kind, menuCell);
  if (error) {
    renderer.reject(menuCell);
    play('deny');
    toast(REASONS[error]);
    return;
  }
  session.issue({ type: 'placeStructure', kind, cell: menuCell });
  closeMenu();
}

/** While a build option is held, its range is previewed on the cell. */
export function hold(kind: string | null): void {
  heldKind = kind;
}

export function startWave(): void {
  if (!session) return;
  session.paused = false;
  session.issue({ type: 'startWave' });
}

export function pause(): void {
  if (!session) return;
  session.paused = true;
  closeMenu();
}

export function resume(): void {
  if (session) session.paused = false;
}

/** 1× → 2× → a five-second 3× burst that falls back to 2×. Tapping during the burst returns to 1×. */
export function cycleSpeed(): void {
  if (!session) return;
  if (burstLeftMs > 0) {
    burstLeftMs = 0;
    baseSpeed = 1;
  } else if (session.speed === 1) {
    baseSpeed = 2;
  } else {
    burstLeftMs = BURST_MS;
    session.speed = BURST_SPEED;
    return;
  }
  session.speed = baseSpeed;
}

export function upgradeSelected(): void {
  if (session && menuCell >= 0) session.issue({ type: 'upgradeTower', cell: menuCell });
}

export function repairSelected(): void {
  if (session && menuCell >= 0) session.issue({ type: 'repairStructure', cell: menuCell });
}

export function sellSelected(): void {
  if (session && menuCell >= 0) session.issue({ type: 'sellStructure', cell: menuCell });
  closeMenu();
}

export function cycleTargeting(): void {
  if (!session || menuCell < 0) return;
  const st = structureAt(session.state, menuCell);
  if (!st) return;
  const mode: TargetingMode = TARGETING_MODES[(TARGETING_MODES.indexOf(st.targeting) + 1) % TARGETING_MODES.length];
  session.issue({ type: 'setTargeting', cell: menuCell, mode });
}

export function retry(): void {
  if (session) void startLevel(session.levelId, session.faction);
}

export function nextLevel(): void {
  if (!session) return;
  const i = content.levels.findIndex((l) => l.id === session!.levelId);
  const next = content.levels[i + 1];
  if (next) void startLevel(next.id, session.faction);
}

// ── Pointer input ───────────────────────────────────────────────────────

/** Double tap on a damaged structure: repair it if it can be afforded. */
function quickRepair(cell: number): void {
  if (!session) return;
  const cost = repairCost(session.state, cell);
  if (cost === 0) return;
  if (session.state.player.supplies < cost) {
    play('deny');
    toast('Not enough supplies');
    return;
  }
  session.issue({ type: 'repairStructure', cell });
}

/** A tap on the board opens the contextual menu for that cell, or closes the open one. */
function onPointerDown(e: PointerEvent): void {
  if (!session || !renderer || session.state.outcome !== 'playing' || session.paused) return;
  unlockAudio();
  const { state } = session;
  const cell = renderer.cellAt(e.clientX, e.clientY);
  if (cell < 0 || state.cells[cell] !== Cell.Ground) {
    closeMenu();
    return;
  }
  const existing = structureAt(state, cell);
  if (existing) {
    const now = performance.now();
    if (cell === lastTapCell && now - lastTapAt < DOUBLE_TAP_MS) {
      quickRepair(cell);
      lastTapAt = 0;
    } else {
      lastTapCell = cell;
      lastTapAt = now;
    }
  } else if (cell === menuCell) {
    // Tapping the same free cell again dismisses its menu.
    closeMenu();
    return;
  }
  heldKind = null;
  menuCell = cell;
  menuOnStructure = !!existing;
}
