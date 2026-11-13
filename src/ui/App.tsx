import { useEffect, useRef, useState } from 'preact/hooks';
import { content, FACTION_ORDER, type FactionId } from '../content';
import * as game from '../game/controller';
import { setState, useAppState, type AppState, type BuildItem, type CellMenu, type Hud, type VerifyStatus } from './store';

export const GAME_NAME = 'Aether Nations TD';
const SPLASH_MS = 3000;
const HOLD_MS = 350;

const VERIFY_TEXT: Record<VerifyStatus, string> = {
  none: '',
  local: 'Played offline — result not verified',
  pending: 'Verifying result…',
  verified: 'Result verified ✓',
  rejected: 'The server did not accept this result',
  queued: 'Offline — will verify on next launch',
};

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

export function App({ onUpdate }: { onUpdate: () => void }) {
  const app = useAppState();
  return (
    <>
      {app.screen === 'splash' && <Splash />}
      {app.screen === 'home' && <Home app={app} onUpdate={onUpdate} />}
      {app.screen === 'nations' && <Nations current={app.faction} />}
      {app.screen === 'levels' && app.faction && <Levels faction={app.faction} progress={app.progress} verified={app.verified} />}
      {app.screen === 'game' && app.hud && <Game hud={app.hud} verify={app.verify} />}
      {app.settingsOpen && <Settings app={app} />}
      {app.toast && <div class="toast" role="status">{app.toast}</div>}
    </>
  );
}

// ── Splash ──────────────────────────────────────────────────────────────

function Splash() {
  useEffect(() => {
    const timer = setTimeout(() => setState({ screen: 'home' }), SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div class="screen splash">
      <img class="splash-logo" src="icon.svg" alt="" width="132" height="132" />
      <h1>{GAME_NAME}</h1>
      <p>Four nations. One wall between them.</p>
      <div class="splash-bar"><span style={{ animationDuration: `${SPLASH_MS}ms` }} /></div>
    </div>
  );
}

// ── Home ────────────────────────────────────────────────────────────────

function Home({ app, onUpdate }: { app: AppState; onUpdate: () => void }) {
  const nation = app.faction ? content.factions[app.faction] : null;
  const resumeLevel = app.resume && content.levels.find((l) => l.id === app.resume!.levelId);
  return (
    <div class="screen home">
      <header class="home-head">
        <img src="icon.svg" alt="" width="72" height="72" />
        <h1>{GAME_NAME}</h1>
      </header>

      {app.updateReady && (
        <button class="banner" onClick={onUpdate}>A new version is ready — tap to update</button>
      )}

      {nation ? (
        <button class="nation-card" style={{ '--accent': hex(nation.color) }} onClick={() => game.goTo('nations')}>
          <small>Your nation</small>
          <strong>{nation.name}</strong>
          <span>{nation.tagline}</span>
          <em>Change</em>
        </button>
      ) : (
        <div class="nation-card empty">
          <small>Your nation</small>
          <strong>Not chosen yet</strong>
          <span>Pick the nation you will defend.</span>
        </div>
      )}

      <nav class="home-actions">
        {app.resume && resumeLevel && (
          <button class="big primary" onClick={() => void game.resumeSaved()}>
            Continue
            <small>{resumeLevel.name} · {content.factions[app.resume.faction].name}</small>
          </button>
        )}
        {nation ? (
          <button class={`big${app.resume ? '' : ' primary'}`} onClick={() => game.goTo('levels')}>
            {app.resume ? 'Select level' : 'Play'}
          </button>
        ) : (
          <button class="big primary" onClick={() => game.goTo('nations')}>Choose your nation</button>
        )}
        {app.multiplayerUnlocked && (
          <button class="big" onClick={() => game.toast('Multiplayer is coming soon')}>Multiplayer</button>
        )}
        <button class="big" onClick={() => game.openSettings(true)}>Settings</button>
      </nav>
    </div>
  );
}

function Nations({ current }: { current: FactionId | null }) {
  return (
    <div class="screen list">
      <ScreenHead title="Choose your nation" />
      <div class="factions">
        {FACTION_ORDER.map((id) => {
          const f = content.factions[id];
          return (
            <button
              key={id}
              class={`faction${current === id ? ' current' : ''}`}
              style={{ '--accent': hex(f.color) }}
              onClick={() => game.chooseFaction(id)}
            >
              <strong>{f.name}</strong>
              <span>{f.tagline}</span>
              <small>{f.towers.map((t) => content.towers[t].name).join(' · ')}</small>
            </button>
          );
        })}
      </div>
      <p class="note">You defend against the other three nations.</p>
    </div>
  );
}

function Levels({ faction, progress, verified }: { faction: FactionId; progress: Record<string, number>; verified: Record<string, number> }) {
  return (
    <div class="screen list">
      <ScreenHead title={`${content.factions[faction].name} · Defense`} />
      <div class="levels">
        {content.levels.map((level, i) => {
          const key = game.progressKey(faction, level.id);
          const earned = progress[key] ?? 0;
          const isVerified = earned > 0 && (verified[key] ?? 0) >= earned;
          const unlocked = i === 0 || (progress[game.progressKey(faction, content.levels[i - 1].id)] ?? 0) > 0;
          return (
            <button key={level.id} class="level" disabled={!unlocked} onClick={() => void game.startLevel(level.id, faction)}>
              <span class="level-num">{i + 1}</span>
              <span class="level-name">
                <strong>{level.name}</strong>
                <small>{unlocked ? `${level.waves.length} waves · ${level.cols}×${level.rows}` : 'Locked'}</small>
              </span>
              <span class="stars">
                {unlocked ? stars(earned) : '🔒'}
                {isVerified && <span class="verified" title="Verified by the server"> ✓</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScreenHead({ title }: { title: string }) {
  return (
    <header class="screen-head">
      <button class="icon-btn" onClick={() => game.goTo('home')} aria-label="Back">‹</button>
      <h2>{title}</h2>
    </header>
  );
}

// ── Settings ────────────────────────────────────────────────────────────

function Settings({ app }: { app: AppState }) {
  return (
    <div class="modal" onClick={() => game.openSettings(false)}>
      <div class="card" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <Toggle label="Sound" on={!app.muted} onChange={game.toggleMute} />
        {app.canVibrate && <Toggle label="Vibration" on={app.vibration} onChange={game.toggleVibration} />}
        <div class="card-actions">
          <button class="primary" onClick={() => game.openSettings(false)}>Done</button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: () => void }) {
  return (
    <button class="toggle" role="switch" aria-checked={on} onClick={onChange}>
      <span>{label}</span>
      <span class={`switch${on ? ' on' : ''}`}><i /></span>
    </button>
  );
}

// ── Game ────────────────────────────────────────────────────────────────

function Game({ hud, verify }: { hud: Hud; verify: VerifyStatus }) {
  const over = hud.outcome !== 'playing';
  const hpPct = Math.round((hud.baseHp * 100) / hud.baseMax);
  return (
    <div class="game">
      {hud.wave === 0 && !hud.waveActive && !hud.menu && !hud.paused && (
        <div class="hint">{hud.hint} Tap a cell to build.</div>
      )}

      {hud.menu && !hud.paused && !over && <ContextMenu menu={hud.menu} />}

      {/* One bar at the bottom, in thumb reach: status left, wave control centred, speed and pause right. */}
      <div class="bar">
        <div class="bar-side">
          <div class="stat" title="Base health">
            <span class="heart">♥</span>
            <span class={hpPct <= 25 ? 'danger' : ''}>{hud.baseHp}</span>
          </div>
          <div class="stat" title="Supplies">
            <span class="coin">●</span>
            <span>{hud.supplies}</span>
          </div>
        </div>
        <button class="wave-btn" disabled={hud.waveActive || over} onClick={game.startWave} aria-label="Start wave">
          <strong>Wave {Math.min(hud.waves, hud.waveActive ? hud.wave : hud.wave + 1)}/{hud.waves}</strong>
          <small>
            {hud.waveActive || over ? 'in progress' : hud.countdown > 0 ? `▶ ${hud.countdown}s · +${hud.countdown}●` : '▶ Start'}
          </small>
        </button>
        <div class="bar-side right">
          <button class={`icon-btn speed${hud.burst > 0 ? ' burst' : ''}`} onClick={game.cycleSpeed} aria-label="Change speed">
            {hud.speed}×{hud.burst > 0 && <small>{hud.burst}s</small>}
          </button>
          <button class="icon-btn" onClick={game.pause} aria-label="Pause">Ⅱ</button>
        </div>
      </div>

      {hud.paused && !over && (
        <div class="modal">
          <div class="card" role="dialog" aria-label="Paused">
            <h2>Paused</h2>
            <p>{hud.levelName} · Wave {Math.max(1, hud.wave)}/{hud.waves}</p>
            <div class="card-actions">
              <button class="primary" onClick={game.resume}>Resume</button>
              <button onClick={() => game.openSettings(true)}>Settings</button>
              <button onClick={game.retry}>Restart level</button>
              <button onClick={game.exitToMenu}>Exit to home</button>
            </div>
          </div>
        </div>
      )}

      {over && (
        <div class="modal">
          <div class="card">
            <h2>{hud.outcome === 'won' ? 'Victory' : 'Base lost'}</h2>
            {hud.outcome === 'won' ? (
              <p class="stars big">{stars(hud.stars)}</p>
            ) : (
              <p>Fell on wave {hud.wave} of {hud.waves}.</p>
            )}
            {VERIFY_TEXT[verify] && <p class={`verify ${verify}`}>{VERIFY_TEXT[verify]}</p>}
            <div class="card-actions">
              {hud.outcome === 'won' && hud.hasNext && <button class="primary" onClick={game.nextLevel}>Next level</button>}
              <button class={hud.outcome === 'won' && hud.hasNext ? '' : 'primary'} onClick={game.retry}>
                {hud.outcome === 'won' ? 'Play again' : 'Retry'}
              </button>
              <button onClick={game.exitToMenu}>Home</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const MENU_WIDTH = 312;
const EDGE = 8;

/** Popup anchored to the tapped cell: build options on free ground or a wall, actions on a structure. */
function ContextMenu({ menu }: { menu: CellMenu }) {
  const [details, setDetails] = useState<BuildItem | null>(null);
  // Details belong to one cell; forget them when the menu moves.
  useEffect(() => setDetails(null), [menu.cell]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(MENU_WIDTH, vw - 2 * EDGE);
  const left = Math.max(EDGE, Math.min(vw - EDGE - width, menu.x + menu.size / 2 - width / 2));
  // Open away from the nearer screen edge so the menu never covers its own cell.
  const below = menu.y + menu.size / 2 < vh / 2;
  const style = below
    ? { left: `${left}px`, width: `${width}px`, top: `${menu.y + menu.size + 6}px` }
    : { left: `${left}px`, width: `${width}px`, bottom: `${vh - menu.y + 6}px` };
  const s = menu.structure;

  return (
    <div class="ctx" style={style}>
      {s && (
        <div class="ctx-info">
          <strong>
            {s.name}
            {!s.isWall && <span class="tier"> · Tier {s.tier + 1}</span>}
          </strong>
          <span class={s.hp < s.maxHp ? 'danger' : ''}>♥ {s.hp}/{s.maxHp}</span>
          <small>{s.isWall ? s.blurb : `${s.blurb} · ${s.stats}`}</small>
        </div>
      )}

      {s && (
        <div class="ctx-row">
          {!s.isWall && (
            <button class="act" onClick={game.cycleTargeting}>
              <small>Target</small>
              {s.targeting}
            </button>
          )}
          {!s.isWall && (
            <button class="act primary" disabled={!s.canUpgrade} onClick={game.upgradeSelected}>
              <small>Upgrade</small>
              {s.upgradeCost === null ? 'Max' : `● ${s.upgradeCost}`}
            </button>
          )}
          <button class="act primary repair" disabled={!s.canRepair} onClick={game.repairSelected}>
            <small>Repair</small>
            {s.repairCost === 0 ? '—' : `● ${s.repairCost}`}
          </button>
          <button class="act sell" onClick={game.sellSelected}>
            <small>Sell</small>● {s.sellValue}
          </button>
        </div>
      )}

      {menu.items.length > 0 && (
        <>
          <div class="ctx-row">
            {menu.items.map((item) => (
              <BuildButton key={item.kind} item={item} onDetails={setDetails} />
            ))}
          </div>
          <div class="ctx-details">
            {details ? (
              <>
                <strong>{details.name}</strong> — {details.blurb}
                {details.stats !== details.blurb && <> · {details.stats}</>}
                {details.blocked && <span class="danger"> · {details.blocked}</span>}
              </>
            ) : (
              <>{s ? 'Replace this wall with a tower' : 'Tap to build'} · hold for details</>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Tap builds; press and hold shows the description and previews the range on the board. */
function BuildButton({ item, onDetails }: { item: BuildItem; onDetails: (item: BuildItem | null) => void }) {
  const timer = useRef(0);
  const held = useRef(false);
  const release = () => {
    clearTimeout(timer.current);
    if (held.current) {
      game.hold(null);
      onDetails(null);
    }
  };
  useEffect(() => release, []);
  return (
    <button
      class={`act build${item.blocked ? ' blocked' : ''}`}
      style={{ '--accent': hex(item.color) }}
      onPointerDown={() => {
        held.current = false;
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          held.current = true;
          game.hold(item.kind);
          onDetails(item);
        }, HOLD_MS);
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        // The click that ends a hold was a request for details, not a purchase.
        if (held.current) held.current = false;
        else game.build(item.kind);
      }}
    >
      <span class="swatch" />
      <span class="build-name">{item.name}</span>
      <span class="build-cost">● {item.cost}</span>
    </button>
  );
}
