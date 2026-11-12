import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { TowerDef, UnitDef } from '../content';
import { Cell, INF, ONE, stepToward, WALL, type GameState, type SimEvent, type Unit } from '../core';

/** Logical pixels per cell; the board container is scaled to the real cell size. */
const L = 64;
const fx = (fixed: number) => (fixed * L) / ONE;

const COLORS = {
  bg: 0x12151c,
  groundA: 0x1e2430,
  groundB: 0x222938,
  spawn: 0x3a2228,
  obstacle: 0x0c0e13,
  rock: 0x3b4152,
  path: 0xffffff,
  ok: 0x6ee07f,
  bad: 0xff5a5a,
};

interface Effect {
  kind: 'ring' | 'burst' | 'chain' | 'flash';
  x: number;
  y: number;
  radius: number;
  color: number;
  age: number;
  life: number;
  points?: number[];
}

interface UnitView {
  root: Container;
  body: Sprite;
  hpBg: Sprite;
  hpFg: Sprite;
}

export interface Overlay {
  /** Cell of the selected structure, or -1. */
  selected: number;
  /** Cell under the finger while a build tool is active, or -1. */
  hover: number;
  hoverValid: boolean;
  /** Range (fixed-point) to preview at the hover cell; 0 for walls. */
  hoverRange: number;
}

export class Renderer {
  readonly overlay: Overlay = { selected: -1, hover: -1, hoverValid: false, hoverRange: 0 };
  private board = new Container();
  private terrain = new Graphics();
  private structures = new Graphics();
  private unitLayer = new Container();
  private effects = new Graphics();
  private unitTextures = new Map<string, Texture>();
  private views = new Map<number, UnitView>();
  private pool: UnitView[] = [];
  private fxList: Effect[] = [];
  private state: GameState | null = null;
  private drawnGrid = -1;
  private cellPx = 0;

  private constructor(
    private app: Application,
    private host: HTMLElement,
  ) {
    this.board.addChild(this.terrain, this.structures, this.unitLayer, this.effects);
    app.stage.addChild(this.board);
  }

  static async create(host: HTMLElement): Promise<Renderer> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: COLORS.bg,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      // The game loop drives rendering so simulation and drawing stay in one place.
      autoStart: false,
    });
    app.canvas.style.touchAction = 'none';
    host.appendChild(app.canvas);
    return new Renderer(app, host);
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  setState(state: GameState | null): void {
    this.state = state;
    this.drawnGrid = -1;
    this.fxList.length = 0;
    for (const v of this.views.values()) this.release(v);
    this.views.clear();
    this.overlay.selected = this.overlay.hover = -1;
    this.terrain.clear();
    this.structures.clear();
    this.effects.clear();
    if (state) {
      this.drawTerrain(state);
      this.layout();
    }
  }

  /** Fit the fixed logical grid to the available area: only the cell size adapts. */
  layout(): void {
    const s = this.state;
    if (!s) return;
    this.app.resize();
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.cellPx = Math.max(8, Math.floor(Math.min(w / s.cols, h / s.rows)));
    this.board.scale.set(this.cellPx / L);
    this.board.position.set(Math.floor((w - this.cellPx * s.cols) / 2), Math.floor((h - this.cellPx * s.rows) / 2));
  }

  /** Cell index under a viewport point, or -1 when outside the board. */
  cellAt(clientX: number, clientY: number): number {
    const s = this.state;
    if (!s || !this.cellPx) return -1;
    const rect = this.app.canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left - this.board.position.x) / this.cellPx);
    const y = Math.floor((clientY - rect.top - this.board.position.y) / this.cellPx);
    if (x < 0 || y < 0 || x >= s.cols || y >= s.rows) return -1;
    return y * s.cols + x;
  }

  onEvent(e: SimEvent): void {
    const s = this.state;
    if (!s) return;
    const cx = (cell: number) => ((cell % s.cols) + 0.5) * L;
    const cy = (cell: number) => (Math.floor(cell / s.cols) + 0.5) * L;
    switch (e.type) {
      case 'pulse':
        this.fxList.push({ kind: 'ring', x: cx(e.cell), y: cy(e.cell), radius: fx(e.range), color: e.color, age: 0, life: 320 });
        break;
      case 'hit':
        this.fxList.push({ kind: 'burst', x: fx(e.x), y: fx(e.y), radius: Math.max(10, fx(e.radius)), color: e.color, age: 0, life: 200 });
        break;
      case 'chain':
        this.fxList.push({ kind: 'chain', x: 0, y: 0, radius: 0, color: 0xdfe6ff, age: 0, life: 160, points: e.points.map(fx) });
        break;
      case 'died':
        this.fxList.push({ kind: 'burst', x: fx(e.x), y: fx(e.y), radius: 16, color: 0xffffff, age: 0, life: 220 });
        break;
      case 'leak':
        this.fxList.push({ kind: 'burst', x: fx(e.x), y: fx(e.y), radius: 44, color: COLORS.bad, age: 0, life: 420 });
        break;
      case 'placed':
      case 'upgraded':
        this.fxList.push({ kind: 'ring', x: cx(e.cell), y: cy(e.cell), radius: 40, color: 0xffffff, age: 0, life: 220 });
        break;
    }
  }

  /** Flash a cell red after a rejected build. */
  reject(cell: number): void {
    const s = this.state;
    if (!s || cell < 0) return;
    this.fxList.push({
      kind: 'flash', x: (cell % s.cols) * L, y: Math.floor(cell / s.cols) * L,
      radius: 0, color: COLORS.bad, age: 0, life: 350,
    });
  }

  frame(alpha: number, dtMs: number): void {
    const s = this.state;
    if (!s) return;
    if (this.drawnGrid !== s.gridVersion) {
      this.drawStructures(s);
      this.drawnGrid = s.gridVersion;
    }
    this.drawUnits(s, alpha);
    this.drawEffects(s, alpha, dtMs);
    this.app.render();
  }

  // ── Static layers ─────────────────────────────────────────────────────

  private drawTerrain(s: GameState): void {
    const g = this.terrain;
    const base = s.content.factions[s.player.faction].color;
    for (let i = 0; i < s.cells.length; i++) {
      const x = (i % s.cols) * L;
      const y = Math.floor(i / s.cols) * L;
      const checker = ((i % s.cols) + Math.floor(i / s.cols)) % 2 === 0;
      const type = s.cells[i];
      g.rect(x, y, L, L).fill(type === Cell.Obstacle ? COLORS.obstacle : checker ? COLORS.groundA : COLORS.groundB);
      if (type === Cell.Spawn) g.rect(x, y, L, L).fill({ color: COLORS.bad, alpha: 0.16 });
      if (type === Cell.Base) g.rect(x, y, L, L).fill({ color: base, alpha: 0.3 });
      if (type === Cell.Obstacle) {
        g.poly([x + 10, y + 50, x + 18, y + 20, x + 36, y + 10, x + 54, y + 28, x + 50, y + 54]).fill(COLORS.rock);
        g.poly([x + 18, y + 20, x + 36, y + 10, x + 32, y + 30]).fill({ color: 0xffffff, alpha: 0.08 });
      }
    }
    // Chevrons on the spawn row, a banner line on the base row.
    for (const c of s.spawnCells) {
      const x = (c % s.cols) * L + L / 2;
      g.moveTo(x - 10, 22).lineTo(x, 34).lineTo(x + 10, 22).stroke({ width: 4, color: COLORS.bad, alpha: 0.6 });
    }
    const by = (s.rows - 1) * L;
    g.rect(0, by, s.cols * L, 4).fill({ color: base, alpha: 0.9 });
  }

  private drawStructures(s: GameState): void {
    const g = this.structures;
    g.clear();
    this.drawPathHint(s, g);
    const wall = s.content.factions[s.player.faction].wall;
    for (const st of s.structures) {
      const x = (st.cell % s.cols) * L;
      const y = Math.floor(st.cell / s.cols) * L;
      g.roundRect(x + 3, y + 3, L - 6, L - 6, 8).fill(wall.color);
      g.roundRect(x + 3, y + 3, L - 6, (L - 6) / 2, 8).fill({ color: 0xffffff, alpha: 0.12 });
      g.roundRect(x + 3, y + 3, L - 6, L - 6, 8).stroke({ width: 2, color: 0x000000, alpha: 0.35 });
      if (st.kind === WALL) continue;
      const def = s.content.towers[st.kind];
      this.drawTower(g, def, x + L / 2, y + L / 2);
      for (let t = 0; t <= st.tier; t++) {
        g.circle(x + L / 2 + (t - st.tier / 2) * 10, y + L - 11, 3.5).fill(0xffffff).stroke({ width: 1, color: 0x000000, alpha: 0.6 });
      }
    }
  }

  private drawTower(g: Graphics, def: TowerDef, cx: number, cy: number): void {
    const dark = { width: 3, color: 0x000000, alpha: 0.55 };
    g.circle(cx, cy - 2, 21).fill({ color: 0x000000, alpha: 0.35 });
    switch (def.attack) {
      case 'single':
        g.circle(cx, cy - 2, 16).fill(def.color).stroke(dark);
        g.circle(cx, cy - 2, 5).fill({ color: 0xffffff, alpha: 0.7 });
        break;
      case 'splash':
        g.roundRect(cx - 15, cy - 17, 30, 30, 5).fill(def.color).stroke(dark);
        g.circle(cx, cy - 2, 7).fill({ color: 0x000000, alpha: 0.45 });
        break;
      case 'pulse':
        g.circle(cx, cy - 2, 16).fill({ color: def.color, alpha: 0.35 }).stroke({ width: 5, color: def.color });
        g.circle(cx, cy - 2, 6).fill(def.color).stroke(dark);
        break;
      case 'chain':
        g.poly([cx, cy - 20, cx + 16, cy - 2, cx, cy + 16, cx - 16, cy - 2]).fill(def.color).stroke(dark);
        g.circle(cx, cy - 2, 4).fill(0xffffff);
        break;
    }
  }

  /** Dotted trail showing the route ground units will take from the middle spawn column. */
  private drawPathHint(s: GameState, g: Graphics): void {
    let cell = s.spawnCells[Math.floor(s.spawnCells.length / 2)];
    if (cell === undefined || s.dist[cell] === INF) return;
    for (let guard = 0; guard < s.cells.length && s.dist[cell] > 0; guard++) {
      const next = stepToward(cell, s.cols, s.rows, s.dist);
      if (next === cell) break;
      const ax = ((cell % s.cols) + 0.5) * L;
      const ay = (Math.floor(cell / s.cols) + 0.5) * L;
      const bx = ((next % s.cols) + 0.5) * L;
      const by = (Math.floor(next / s.cols) + 0.5) * L;
      g.circle((ax + bx) / 2, (ay + by) / 2, 3).fill({ color: COLORS.path, alpha: 0.22 });
      g.circle(bx, by, 3).fill({ color: COLORS.path, alpha: 0.22 });
      cell = next;
    }
  }

  // ── Units ─────────────────────────────────────────────────────────────

  private unitTexture(s: GameState, def: UnitDef): Texture {
    let tex = this.unitTextures.get(def.id);
    if (tex) return tex;
    const color = s.content.factions[def.faction].color;
    const g = new Graphics();
    const outline = { width: 3, color: 0x0a0c10 };
    const r = def.swarm > 1 ? 8 : def.role === 'tank' ? 21 : def.role === 'elite' ? 16 : def.role === 'fast' ? 13 : 13;
    if (def.flying) {
      // Wings mark anything that ignores the maze.
      g.ellipse(0, 0, r + 12, r * 0.45).fill({ color: 0xffffff, alpha: 0.85 }).stroke(outline);
    }
    switch (def.role) {
      case 'tank':
        g.roundRect(-r, -r, r * 2, r * 2, 6).fill(color).stroke(outline);
        break;
      case 'elite':
        g.poly([0, -r - 2, r + 1, r - 2, -r - 1, r - 2]).fill(color).stroke(outline);
        break;
      case 'fast':
        g.poly([0, -r - 3, r, 0, 0, r + 3, -r, 0]).fill(color).stroke(outline);
        break;
      default:
        g.circle(0, 0, r).fill(color).stroke(outline);
    }
    g.circle(-r * 0.25, -r * 0.3, r * 0.3).fill({ color: 0xffffff, alpha: 0.3 });
    tex = this.app.renderer.generateTexture({ target: g, resolution: 2, antialias: true });
    g.destroy();
    this.unitTextures.set(def.id, tex);
    return tex;
  }

  private acquire(): UnitView {
    const v = this.pool.pop();
    if (v) {
      v.root.visible = true;
      return v;
    }
    const root = new Container();
    const body = new Sprite();
    body.anchor.set(0.5);
    const hpBg = new Sprite(Texture.WHITE);
    const hpFg = new Sprite(Texture.WHITE);
    hpBg.tint = 0x000000;
    hpBg.alpha = 0.7;
    root.addChild(body, hpBg, hpFg);
    this.unitLayer.addChild(root);
    return { root, body, hpBg, hpFg };
  }

  private release(v: UnitView): void {
    v.root.visible = false;
    this.pool.push(v);
  }

  private statusTint(u: Unit): number {
    if (u.stunTicks > 0) return 0x8a8f9c;
    if (u.burnTicks > 0) return 0xffb070;
    if (u.slowTicks > 0) return 0x8fd0ff;
    return 0xffffff;
  }

  private drawUnits(s: GameState, alpha: number): void {
    const seen = new Set<number>();
    for (const u of s.units) {
      seen.add(u.id);
      let v = this.views.get(u.id);
      if (!v) {
        v = this.acquire();
        v.body.texture = this.unitTexture(s, s.content.units[u.kind]);
        this.views.set(u.id, v);
      }
      v.root.position.set(fx(u.px + (u.x - u.px) * alpha), fx(u.py + (u.y - u.py) * alpha));
      v.root.zIndex = u.flying ? 1 : 0;
      v.body.tint = this.statusTint(u);
      const hurt = u.hp < u.maxHp;
      v.hpBg.visible = v.hpFg.visible = hurt;
      if (hurt) {
        const w = 30;
        const top = -v.body.texture.height / 2 - 7;
        const ratio = Math.max(0, u.hp / u.maxHp);
        v.hpBg.position.set(-w / 2 - 1, top - 1);
        v.hpBg.width = w + 2;
        v.hpBg.height = 6;
        v.hpFg.position.set(-w / 2, top);
        v.hpFg.width = w * ratio;
        v.hpFg.height = 4;
        v.hpFg.tint = ratio > 0.5 ? COLORS.ok : ratio > 0.25 ? 0xffc94a : COLORS.bad;
      }
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.release(v);
        this.views.delete(id);
      }
    }
    this.unitLayer.sortableChildren = true;
  }

  // ── Per-frame overlay ─────────────────────────────────────────────────

  private drawEffects(s: GameState, alpha: number, dtMs: number): void {
    const g = this.effects;
    g.clear();

    for (const p of s.projectiles) {
      const color = s.content.towers[p.tower].color;
      g.circle(fx(p.px + (p.x - p.px) * alpha), fx(p.py + (p.y - p.py) * alpha), 5).fill(color).stroke({ width: 1.5, color: 0x000000, alpha: 0.6 });
    }

    let w = 0;
    for (const e of this.fxList) {
      e.age += dtMs;
      if (e.age >= e.life) continue;
      this.fxList[w++] = e;
      const t = e.age / e.life;
      const fade = 1 - t;
      switch (e.kind) {
        case 'ring':
          g.circle(e.x, e.y, e.radius * (0.3 + 0.7 * t)).stroke({ width: 5, color: e.color, alpha: fade * 0.8 });
          break;
        case 'burst':
          g.circle(e.x, e.y, e.radius * (0.4 + 0.6 * t)).fill({ color: e.color, alpha: fade * 0.45 });
          break;
        case 'chain': {
          const p = e.points!;
          g.moveTo(p[0], p[1]);
          for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
          g.stroke({ width: 4, color: e.color, alpha: fade });
          break;
        }
        case 'flash':
          g.rect(e.x, e.y, L, L).fill({ color: e.color, alpha: fade * 0.55 });
          break;
      }
    }
    this.fxList.length = w;

    const o = this.overlay;
    if (o.selected >= 0) {
      const st = s.structures.find((x) => x.cell === o.selected);
      const cx = ((o.selected % s.cols) + 0.5) * L;
      const cy = (Math.floor(o.selected / s.cols) + 0.5) * L;
      g.roundRect(cx - L / 2 + 2, cy - L / 2 + 2, L - 4, L - 4, 8).stroke({ width: 3, color: 0xffffff });
      if (st && st.kind !== WALL) this.drawRange(g, s.content.towers[st.kind], st.tier, cx, cy, 0xffffff);
    }
    if (o.hover >= 0) {
      const x = (o.hover % s.cols) * L;
      const y = Math.floor(o.hover / s.cols) * L;
      const color = o.hoverValid ? COLORS.ok : COLORS.bad;
      g.rect(x, y, L, L).fill({ color, alpha: 0.3 }).stroke({ width: 2, color, alpha: 0.9 });
      if (o.hoverRange > 0) {
        g.circle(x + L / 2, y + L / 2, fx(o.hoverRange)).fill({ color, alpha: 0.07 }).stroke({ width: 2, color, alpha: 0.6 });
      }
    }
  }

  private drawRange(g: Graphics, def: TowerDef, tier: number, cx: number, cy: number, color: number): void {
    g.circle(cx, cy, fx(def.tiers[tier].range)).fill({ color, alpha: 0.06 }).stroke({ width: 2, color, alpha: 0.5 });
    if (def.minRange) g.circle(cx, cy, fx(def.minRange)).stroke({ width: 1.5, color: COLORS.bad, alpha: 0.5 });
  }
}
