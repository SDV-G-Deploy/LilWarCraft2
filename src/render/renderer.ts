import type { GameState, TileKind, Entity } from '../types';
import { TILE_SIZE, MAP_W, MAP_H, CORPSE_LIFE_TICKS, isUnitKind } from '../types';
import type { Camera } from './camera';
import { worldToScreen } from './camera';
import { buildSpriteCache, type SpriteCache } from './sprites';

// ─── Sprite cache (built once on first render) ────────────────────────────────

let sprites: SpriteCache | null = null;
function getSprites(): SpriteCache {
  if (!sprites) sprites = buildSpriteCache(TILE_SIZE);
  return sprites;
}

// ─── Visual constants ─────────────────────────────────────────────────────────

const SELECTION_COLOR = '#00ff88';
const FOG_UNSEEN      = 'rgba(0,0,0,1.00)';
const FOG_EXPLORED    = 'rgba(0,0,0,0.58)';
const GRID_COLOR      = 'rgba(0,0,0,0.07)';

// ─── Main render ──────────────────────────────────────────────────────────────

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: Camera,
  viewW: number,
  viewH: number,
  selectedIds: Set<number>,
): void {
  const sp = getSprites();

  ctx.clearRect(0, 0, viewW, viewH);
  // Crisp pixel rendering for retro look
  ctx.imageSmoothingEnabled = false;

  drawTiles(ctx, sp, state, cam, viewW, viewH);
  drawCorpses(ctx, sp, state, cam);
  drawEntities(ctx, sp, state, cam, selectedIds);
  drawFog(ctx, state, cam, viewW, viewH);
  drawHUD(ctx, state);
}

// ─── Tiles ────────────────────────────────────────────────────────────────────

function tileSprite(sp: SpriteCache, kind: TileKind, tick: number): HTMLCanvasElement {
  switch (kind) {
    case 'grass':    return sp.grass;
    case 'tree':     return sp.tree;
    case 'water':    return sp.water[Math.floor(tick / 10) % 4];
    case 'rock':     return sp.rock;
    case 'goldmine': return sp.goldtile;
    default:         return sp.grass;
  }
}

function drawTiles(
  ctx: CanvasRenderingContext2D,
  sp: SpriteCache,
  state: GameState,
  cam: Camera,
  viewW: number,
  viewH: number,
): void {
  const startTX = Math.max(0, Math.floor(cam.x / TILE_SIZE));
  const startTY = Math.max(0, Math.floor(cam.y / TILE_SIZE));
  const endTX   = Math.min(MAP_W - 1, startTX + Math.ceil(viewW / TILE_SIZE) + 1);
  const endTY   = Math.min(MAP_H - 1, startTY + Math.ceil(viewH / TILE_SIZE) + 1);

  for (let ty = startTY; ty <= endTY; ty++) {
    for (let tx = startTX; tx <= endTX; tx++) {
      const tile = state.tiles[ty][tx];
      const { sx, sy } = worldToScreen(tx * TILE_SIZE, ty * TILE_SIZE, cam);
      ctx.drawImage(tileSprite(sp, tile.kind, state.tick), sx, sy, TILE_SIZE, TILE_SIZE);
      // Subtle grid line
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }
  }
}

// ─── Corpses ──────────────────────────────────────────────────────────────────

function drawCorpses(
  ctx: CanvasRenderingContext2D,
  sp: SpriteCache,
  state: GameState,
  cam: Camera,
): void {
  for (const c of state.corpses) {
    const age   = state.tick - c.deadTick;
    const alpha = Math.max(0, 1 - age / CORPSE_LIFE_TICKS);
    if (alpha <= 0) continue;
    const { sx, sy } = worldToScreen(c.pos.x * TILE_SIZE, c.pos.y * TILE_SIZE, cam);
    ctx.save();
    ctx.globalAlpha = alpha * 0.75;
    ctx.drawImage(sp.corpse, sx, sy, TILE_SIZE, TILE_SIZE);
    ctx.restore();
  }
}

// ─── Entities ─────────────────────────────────────────────────────────────────

/**
 * Fog visibility rules (WC2-style):
 *  - Own units/buildings: always visible
 *  - Gold mines: visible once explored
 *  - Enemy units: visible only in 'visible' fog cells
 *  - Enemy buildings: visible once explored (remembered after scouting)
 */
function entityVisible(state: GameState, e: Entity): boolean {
  if (e.owner === 0 && e.kind !== 'goldmine') return true;
  const cx  = Math.min(MAP_W - 1, Math.max(0, e.pos.x + Math.floor(e.tileW / 2)));
  const cy  = Math.min(MAP_H - 1, Math.max(0, e.pos.y + Math.floor(e.tileH / 2)));
  const fog = state.fog[cy][cx];
  if (e.owner === 1 && isUnitKind(e.kind)) return fog === 'visible';
  return fog !== 'unseen';
}

function drawEntities(
  ctx: CanvasRenderingContext2D,
  sp: SpriteCache,
  state: GameState,
  cam: Camera,
  selectedIds: Set<number>,
): void {
  // Draw buildings first, units on top
  for (const pass of [false, true] as const) {
    for (const e of state.entities) {
      if (!entityVisible(state, e)) continue;
      const isUnit = isUnitKind(e.kind);
      if (isUnit !== pass) continue;

      const wx = e.pos.x * TILE_SIZE;
      const wy = e.pos.y * TILE_SIZE;
      const { sx, sy } = worldToScreen(wx, wy, cam);
      const selected = selectedIds.has(e.id);
      const pw = e.tileW * TILE_SIZE;
      const ph = e.tileH * TILE_SIZE;

      if (isUnit) {
        drawUnit(ctx, sp, e, sx, sy, selected);
      } else {
        drawBuilding(ctx, sp, e, sx, sy, pw, ph, selected, state);
      }
    }
  }
}

function drawUnit(
  ctx: CanvasRenderingContext2D,
  sp: SpriteCache,
  e: Entity,
  sx: number, sy: number,
  selected: boolean,
): void {
  const cx = sx + TILE_SIZE / 2;
  const cy = sy + TILE_SIZE / 2;

  // Selection ring
  if (selected) {
    ctx.beginPath();
    ctx.arc(cx, cy, TILE_SIZE * 0.48, 0, Math.PI * 2);
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Sprite
  const sprite = (e.kind === 'worker'  ? sp.worker  :
                  e.kind === 'footman' ? sp.footman :
                                         sp.archer)[e.owner as 0 | 1];
  ctx.drawImage(sprite, sx, sy, TILE_SIZE, TILE_SIZE);

  // HP bar
  drawHpBar(ctx, sx, sy, TILE_SIZE, 3, e.hp / e.hpMax);

  // Small carrying-gold indicator
  if (e.carryGold) {
    ctx.fillStyle = '#ffe840';
    ctx.beginPath();
    ctx.arc(sx + TILE_SIZE - 4, sy + 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  sp: SpriteCache,
  e: Entity,
  sx: number, sy: number,
  pw: number, ph: number,
  selected: boolean,
  state: GameState,
): void {
  // Selection ring
  if (selected) {
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - 2, sy - 2, pw + 4, ph + 4);
  }

  // Sprite
  let sprite: HTMLCanvasElement;
  if (e.kind === 'goldmine') {
    sprite = sp.goldmine;
  } else if (e.kind === 'wall') {
    sprite = sp.wall[e.owner as 0 | 1];
  } else if (e.kind === 'townhall') {
    sprite = sp.townhall[e.owner as 0 | 1];
  } else if (e.kind === 'barracks') {
    sprite = sp.barracks[e.owner as 0 | 1];
  } else {
    sprite = sp.farm[e.owner as 0 | 1];
  }
  ctx.drawImage(sprite, sx, sy, pw, ph);

  // Construction overlay (scaffolding hatching while being built)
  if (e.cmd?.type === 'train') {
    // no overlay needed for training — building is complete
  }

  // HP bar (buildings get a taller bar for readability)
  drawHpBar(ctx, sx, sy, pw, e.kind === 'wall' ? 3 : 5, e.hp / e.hpMax);

  // Construction progress overlay
  const buildingCmd = state.entities.find(en =>
    en.cmd?.type === 'build' &&
    en.cmd.phase === 'building' &&
    en.cmd.pos.x === e.pos.x &&
    en.cmd.pos.y === e.pos.y,
  )?.cmd;
  if (buildingCmd?.type === 'build' && buildingCmd.phase === 'building') {
    // Scaffolding lines overlay
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = '#c8b068';
    ctx.lineWidth = 1.5;
    for (let x = sx; x < sx + pw; x += 8) {
      ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x + ph, sy + ph); ctx.stroke();
    }
    for (let y = sy; y < sy + ph; y += 8) {
      ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + pw, y + pw); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawHpBar(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  w: number, h: number,
  frac: number,
): void {
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(sx, sy - h - 2, w, h);
  const col = frac > 0.6 ? '#38cc38' : frac > 0.3 ? '#d8c020' : '#cc2828';
  ctx.fillStyle = col;
  ctx.fillRect(sx, sy - h - 2, Math.round(w * frac), h);
}

// ─── Fog ──────────────────────────────────────────────────────────────────────

function drawFog(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cam: Camera,
  viewW: number,
  viewH: number,
): void {
  const startTX = Math.max(0, Math.floor(cam.x / TILE_SIZE));
  const startTY = Math.max(0, Math.floor(cam.y / TILE_SIZE));
  const endTX   = Math.min(MAP_W - 1, startTX + Math.ceil(viewW / TILE_SIZE) + 1);
  const endTY   = Math.min(MAP_H - 1, startTY + Math.ceil(viewH / TILE_SIZE) + 1);

  for (let ty = startTY; ty <= endTY; ty++) {
    for (let tx = startTX; tx <= endTX; tx++) {
      const fog = state.fog[ty][tx];
      if (fog === 'visible') continue;
      const { sx, sy } = worldToScreen(tx * TILE_SIZE, ty * TILE_SIZE, cam);
      ctx.fillStyle = fog === 'unseen' ? FOG_UNSEEN : FOG_EXPLORED;
      ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
    }
  }
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

function drawHUD(ctx: CanvasRenderingContext2D, state: GameState): void {
  const popFull = state.pop[0] >= state.popCap[0];
  // Backdrop
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(4, 4, 320, 22);
  // Gold icon (small yellow diamond)
  ctx.fillStyle = '#e8c828';
  ctx.beginPath();
  ctx.moveTo(14, 10); ctx.lineTo(19, 15); ctx.lineTo(14, 20); ctx.lineTo(9, 15);
  ctx.closePath();
  ctx.fill();
  // Text
  ctx.fillStyle = '#ffe97a';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(`${state.gold[0]}g`, 24, 20);
  // Pop icon (small person silhouette)
  ctx.fillStyle = popFull ? '#ff5555' : '#55dd55';
  ctx.beginPath();
  ctx.arc(94, 11, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(90, 15, 8, 8);
  ctx.fillStyle = popFull ? '#ff8888' : '#88ff88';
  ctx.fillText(`${state.pop[0]} / ${state.popCap[0]}`, 106, 20);
  // Tick (small clock icon)
  ctx.fillStyle = '#888880';
  ctx.font = '11px monospace';
  ctx.fillText(`⏱ ${state.tick}`, 200, 20);
}
