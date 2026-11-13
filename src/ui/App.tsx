import { content, FACTION_ORDER, type FactionId } from '../content';
import * as game from '../game/controller';
import { useAppState, type Hud, type VerifyStatus } from './store';

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
      {app.screen === 'menu' ? <Menu onUpdate={onUpdate} /> : app.hud && <Game hud={app.hud} verify={app.verify} />}
      {app.toast && <div class="toast" role="status">{app.toast}</div>}
    </>
  );
}

function Menu({ onUpdate }: { onUpdate: () => void }) {
  const app = useAppState();
  const faction = app.faction;
  return (
    <div class="menu">
      <header class="menu-head">
        <h1>Legend TD</h1>
        <button class="icon-btn" onClick={game.toggleMute} aria-label={app.muted ? 'Unmute' : 'Mute'}>
          {app.muted ? '🔇' : '🔊'}
        </button>
      </header>

      {app.updateReady && (
        <button class="banner" onClick={onUpdate}>A new version is ready — tap to update</button>
      )}
      {app.resume && (
        <button class="banner resume" onClick={() => void game.resumeSaved()}>
          Resume {content.levels.find((l) => l.id === app.resume!.levelId)?.name} · {content.factions[app.resume.faction].name}
        </button>
      )}

      {!faction ? (
        <>
          <h2>Choose your nation</h2>
          <div class="factions">
            {FACTION_ORDER.map((id) => {
              const f = content.factions[id];
              return (
                <button key={id} class="faction" style={{ '--accent': hex(f.color) }} onClick={() => game.chooseFaction(id)}>
                  <strong>{f.name}</strong>
                  <span>{f.tagline}</span>
                  <small>{f.towers.map((t) => content.towers[t].name).join(' · ')}</small>
                </button>
              );
            })}
          </div>
          <p class="note">You defend against the other three nations.</p>
        </>
      ) : (
        <Levels faction={faction} progress={app.progress} verified={app.verified} />
      )}
    </div>
  );
}

function Levels({ faction, progress, verified }: { faction: FactionId; progress: Record<string, number>; verified: Record<string, number> }) {
  const f = content.factions[faction];
  return (
    <>
      <div class="chosen" style={{ '--accent': hex(f.color) }}>
        <div>
          <strong>{f.name}</strong>
          <span>{f.tagline}</span>
        </div>
        <button class="text-btn" onClick={() => game.chooseFaction(null)}>Change</button>
      </div>
      <h2>Defense campaign</h2>
      <div class="levels">
        {content.levels.map((level, i) => {
          const earned = progress[game.progressKey(faction, level.id)] ?? 0;
          const isVerified = earned > 0 && (verified[game.progressKey(faction, level.id)] ?? 0) >= earned;
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
    </>
  );
}

function Game({ hud, verify }: { hud: Hud; verify: VerifyStatus }) {
  const over = hud.outcome !== 'playing';
  const hpPct = Math.round((hud.baseHp * 100) / hud.baseMax);
  return (
    <div class="game">
      <div class="top">
        <button class="icon-btn" onClick={game.exitToMenu} aria-label="Back to menu">‹</button>
        <div class="stat" title="Base health">
          <span class="stat-icon heart">♥</span>
          <span class={hpPct <= 25 ? 'danger' : ''}>{hud.baseHp}</span>
        </div>
        <div class="stat" title="Supplies">
          <span class="stat-icon coin">●</span>
          <span>{hud.supplies}</span>
        </div>
        <button class="wave-btn" disabled={hud.waveActive || over} onClick={game.startWave} aria-label="Start wave">
          <strong>Wave {Math.min(hud.waves, hud.waveActive ? hud.wave : hud.wave + 1)}/{hud.waves}</strong>
          <small>
            {hud.waveActive || over ? 'in progress' : hud.countdown > 0 ? `▶ ${hud.countdown}s · +${hud.countdown}●` : '▶ Start'}
          </small>
        </button>
        <button class={`icon-btn speed${hud.burst > 0 ? ' burst' : ''}`} onClick={game.cycleSpeed} aria-label="Change speed">
          {hud.speed}×{hud.burst > 0 && <small>{hud.burst}s</small>}
        </button>
        <button class="icon-btn" onClick={game.togglePause} aria-label={hud.paused ? 'Resume' : 'Pause'}>
          {hud.paused ? '▶' : 'Ⅱ'}
        </button>
      </div>

      {hud.wave === 0 && !hud.waveActive && hud.hint && <div class="hint">{hud.hint}</div>}
      {hud.paused && !over && <div class="paused" onClick={game.togglePause}>Paused — tap to resume</div>}

      <div class="bottom">
        {hud.selection ? (
          <div class="panel">
            <div class="panel-info">
              <strong>
                {hud.selection.name}
                {!hud.selection.isWall && <span class="tier"> · Tier {hud.selection.tier + 1}</span>}
              </strong>
              <small>
                {hud.selection.stats} · <span class={hud.selection.hp < hud.selection.maxHp ? 'danger' : ''}>♥ {hud.selection.hp}/{hud.selection.maxHp}</span>
              </small>
            </div>
            <div class="panel-actions">
              {/* Every slot is always rendered so no button moves or resizes between selections. */}
              <button class={`act${hud.selection.isWall ? ' ghost' : ''}`} disabled={hud.selection.isWall} onClick={game.cycleTargeting}>
                <small>Target</small>
                {hud.selection.targeting}
              </button>
              <button
                class={`act primary${hud.selection.isWall ? ' ghost' : ''}`}
                disabled={hud.selection.isWall || !hud.selection.canUpgrade}
                onClick={game.upgradeSelected}
              >
                <small>Upgrade</small>
                {hud.selection.upgradeCost === null ? 'Max' : `● ${hud.selection.upgradeCost}`}
              </button>
              <button
                class="act primary"
                disabled={hud.selection.repairCost === 0 || !hud.selection.canRepair}
                onClick={game.repairSelected}
              >
                <small>Repair</small>
                {hud.selection.repairCost === 0 ? '—' : `● ${hud.selection.repairCost}`}
              </button>
              <button class="act" onClick={game.sellSelected}>
                <small>Sell</small>● {hud.selection.sellValue}
              </button>
              <button class="act close" onClick={game.deselect} aria-label="Close">✕</button>
            </div>
          </div>
        ) : (
          <div class="build">
            {hud.items.map((item) => (
              <button
                key={item.kind}
                class={`tool${hud.tool === item.kind ? ' active' : ''}${item.affordable ? '' : ' poor'}`}
                style={{ '--accent': hex(item.color) }}
                onClick={() => game.selectTool(item.kind)}
                title={item.blurb}
              >
                <span class="swatch" />
                <span class="tool-name">{item.name}</span>
                <span class="tool-cost">● {item.cost}</span>
              </button>
            ))}
          </div>
        )}
        {hud.tool && !hud.selection && (
          <div class="tool-blurb">{hud.items.find((i) => i.kind === hud.tool)?.blurb} — tap the board to build</div>
        )}
      </div>

      {over && (
        <div class="result">
          <div class="result-card">
            <h2>{hud.outcome === 'won' ? 'Victory' : 'Base lost'}</h2>
            {hud.outcome === 'won' ? (
              <p class="stars big">{stars(hud.stars)}</p>
            ) : (
              <p>Fell on wave {hud.wave} of {hud.waves}.</p>
            )}
            {VERIFY_TEXT[verify] && <p class={`verify ${verify}`}>{VERIFY_TEXT[verify]}</p>}
            <div class="result-actions">
              {hud.outcome === 'won' && hud.hasNext && <button class="primary" onClick={game.nextLevel}>Next level</button>}
              <button class={hud.outcome === 'won' && hud.hasNext ? '' : 'primary'} onClick={game.retry}>
                {hud.outcome === 'won' ? 'Play again' : 'Retry'}
              </button>
              <button onClick={game.exitToMenu}>Menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
