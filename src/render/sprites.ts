/**
 * sprites.ts
 * Pre-renders every game graphic to an offscreen HTMLCanvasElement at startup.
 * The renderer then blits these each frame with drawImage() — very fast.
 * Style: Warcraft II retro (earthy palette, chunky units, stone buildings).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpriteCache {
  // Terrain (one canvas per tile kind)
  grass:    HTMLCanvasElement;
  tree:     HTMLCanvasElement;
  water:    HTMLCanvasElement[];   // 4 animation frames
  rock:     HTMLCanvasElement;
  goldtile: HTMLCanvasElement;     // tile under the mine
  // Units  [0]=player(blue) [1]=AI(red)
  worker:   [HTMLCanvasElement, HTMLCanvasElement];
  footman:  [HTMLCanvasElement, HTMLCanvasElement];
  archer:   [HTMLCanvasElement, HTMLCanvasElement];
  // Buildings  [0]=player  [1]=AI
  townhall: [HTMLCanvasElement, HTMLCanvasElement];
  barracks: [HTMLCanvasElement, HTMLCanvasElement];
  farm:     [HTMLCanvasElement, HTMLCanvasElement];
  wall:     [HTMLCanvasElement, HTMLCanvasElement];
  // Neutral
  goldmine: HTMLCanvasElement;
  // FX
  corpse:   HTMLCanvasElement;
}

// ─── Palette ─────────────────────────────────────────────────────────────────

const INK     = '#181412';          // dark outline (unused directly — kept for reference)
const SKIN    = '#d09060';
// Team colors: [player-blue, ai-red]
const TC_D  = ['#12246a', '#6a1212'] as const;
const TC_M  = ['#2848b8', '#b82828'] as const;
const TC_L  = ['#4878f0', '#f04848'] as const;
const TC_HL = ['#80b8ff', '#ffb0b0'] as const;
// Stone
const ST_VD = '#282420';
const ST_D  = '#403c30';
const ST_M  = '#605848';
const ST_L  = '#807868';
const ST_HL = '#b0a888';
// Wood
const WD_D  = '#3c1e08';
const WD_M  = '#6a3c14';
const WD_L  = '#9a5a28';
// Gold
const GD_D  = '#604c04';
const GD_M  = '#a88010';
const GD_L  = '#d8b020';
const GD_HL = '#fff098';
// Metal
const MT_D  = '#282828';
const MT_M  = '#585858';
const MT_L  = '#a8a8a8';
const MT_HL = '#e0e0e0';
// Greens (terrain + archer)
const GR_VD = '#1a3008';
const GR_D  = '#28480e';
const GR_M  = '#386018';
const GR_L  = '#4a8024';
const GR_HL = '#68aa38';

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function oc(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

/** Simple deterministic LCG so terrain textures are always identical */
function rng(seed: number) {
  let s = seed | 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) | 0; return (s >>> 0) / 0x100000000; };
}

/** Fill a rounded rect */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** Draw crenellations along top edge */
function crenels(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, step: number, h: number) {
  for (let px = x; px < x + w; px += step) {
    ctx.fillRect(px, y - h, step - 2, h);
  }
}

/** Draw a stone-block texture inside a rectangle */
function stoneTexture(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  base: string, mid: string, light: string,
  rowH = 7, colW = 12,
): void {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  let rowOffset = 0;
  for (let row = 0; row * rowH < h; row++) {
    const ry = y + row * rowH;
    const rh = Math.min(rowH - 1, h - row * rowH);
    rowOffset = (row % 2) * Math.floor(colW / 2);
    for (let col = -1; col * colW < w; col++) {
      const cx2 = x + col * colW + rowOffset;
      const cw = Math.min(colW - 1, w - col * colW - rowOffset + x);
      if (cw <= 0) continue;
      // Stone face
      ctx.fillStyle = mid;
      ctx.fillRect(cx2, ry, cw, rh);
      // Top highlight
      ctx.fillStyle = light;
      ctx.fillRect(cx2, ry, cw, 1);
      // Left highlight
      ctx.fillRect(cx2, ry, 1, rh);
    }
  }
  // Mortar lines (base color)
  ctx.fillStyle = base;
  for (let row = 0; row * rowH < h; row++) {
    ctx.fillRect(x, y + row * rowH - 1, w, 1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TERRAIN
// ═══════════════════════════════════════════════════════════════════════════════

function makeGrass(T: number): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  const r = rng(1337);
  ctx.fillStyle = GR_M;
  ctx.fillRect(0, 0, T, T);
  // Texture tufts
  for (let i = 0; i < 20; i++) {
    const x = Math.floor(r() * T);
    const y = Math.floor(r() * T);
    ctx.fillStyle = r() > 0.55 ? GR_L : GR_D;
    ctx.fillRect(x, y, r() > 0.5 ? 2 : 1, 1);
  }
  // Subtle dark edge to define tile boundary when zoomed out
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, 0, T, 1);
  ctx.fillRect(0, 0, 1, T);
  return c;
}

function makeTree(T: number): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  // Dark forest floor
  ctx.fillStyle = GR_VD;
  ctx.fillRect(0, 0, T, T);
  // Trunk
  ctx.fillStyle = WD_M;
  ctx.fillRect(T / 2 - 2, T - 8, 4, 8);
  ctx.fillStyle = WD_D;
  ctx.fillRect(T / 2 - 1, T - 8, 1, 8);
  // Three overlapping canopy circles
  const blob = (bx: number, by: number, br: number, col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(T / 2 - 4, T / 2 + 2,  8, GR_VD);
  blob(T / 2 + 4, T / 2 + 2,  8, '#1e420a');
  blob(T / 2,     T / 2 - 3, 10, GR_D);
  blob(T / 2,     T / 2 - 3,  7, '#2e5610');
  // Highlight spot (sun shining top-left)
  ctx.fillStyle = 'rgba(120,200,80,0.18)';
  ctx.beginPath();
  ctx.arc(T / 2 - 3, T / 2 - 6, 4, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

function makeWater(T: number, frame: number): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  ctx.fillStyle = '#0e2870';
  ctx.fillRect(0, 0, T, T);
  // Deep wave bands
  ctx.fillStyle = '#142e88';
  for (let y = 0; y < T; y += 6) {
    const oy = ((y + frame * 4) % T);
    ctx.fillRect(0, oy, T, 2);
  }
  // Lighter ripple lines with sine wobble
  ctx.strokeStyle = '#2858c0';
  ctx.lineWidth = 1;
  for (let row = 0; row < 3; row++) {
    const baseY = ((row * 11 + frame * 3) % (T + 4)) - 2;
    ctx.beginPath();
    for (let x = 0; x <= T; x += 2) {
      const y2 = baseY + Math.sin((x + frame * 5) * 0.35) * 2;
      x === 0 ? ctx.moveTo(x, y2) : ctx.lineTo(x, y2);
    }
    ctx.stroke();
  }
  // Sparkle highlights
  const r = rng(frame * 31 + 7);
  ctx.fillStyle = 'rgba(120,180,255,0.55)';
  for (let i = 0; i < 2; i++) {
    ctx.fillRect(Math.floor(r() * (T - 3)), Math.floor(r() * (T - 2)), 3, 1);
  }
  return c;
}

function makeRock(T: number): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  ctx.fillStyle = ST_D;
  ctx.fillRect(0, 0, T, T);
  // Two large rock masses
  const block = (x: number, y: number, w: number, h: number, face: string, top: string) => {
    ctx.fillStyle = face;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = top;
    ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = ST_D;
    ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillRect(x, y + h - 1, w, 1);
  };
  block(1, 1, 14, 13, ST_M, ST_L);
  block(17, 2, 13, 11, '#505040', ST_M);
  block(4, 16, 24, 13, ST_M, ST_HL);
  // Crack lines
  ctx.fillStyle = ST_VD;
  ctx.fillRect(15, 0, 2, 15);
  ctx.fillRect(0, 14, T, 2);
  return c;
}

function makeGoldTile(T: number): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  const r = rng(2023);
  ctx.fillStyle = '#3a3020';
  ctx.fillRect(0, 0, T, T);
  // Scattered pebble/earth patches
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(r() * T);
    const y = Math.floor(r() * T);
    ctx.fillStyle = r() > 0.5 ? '#4a4030' : '#504838';
    ctx.fillRect(x, y, 2, 2);
  }
  // Gold flecks
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = GD_M;
    ctx.fillRect(Math.floor(r() * (T - 2)), Math.floor(r() * (T - 2)), 2, 1);
  }
  return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNITS  (all 32×32)
// ═══════════════════════════════════════════════════════════════════════════════

function unitShadow(ctx: CanvasRenderingContext2D, T: number) {
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(T / 2, T - 4, T * 0.28, T * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function makeWorker(T: number, owner: 0 | 1): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  const cx = T / 2;

  unitShadow(ctx, T);

  // ── Legs ──
  ctx.fillStyle = '#6a3c14';
  ctx.fillRect(cx - 5, 20, 4, 7);
  ctx.fillRect(cx + 1, 20, 4, 7);
  // Boots
  ctx.fillStyle = '#1c0c04';
  ctx.fillRect(cx - 6, 26, 6, 3);
  ctx.fillRect(cx,     26, 6, 3);

  // ── Tunic body ──
  ctx.fillStyle = '#7a4818';
  ctx.beginPath();
  ctx.moveTo(cx - 7, 13);
  ctx.lineTo(cx + 7, 13);
  ctx.lineTo(cx + 6, 22);
  ctx.lineTo(cx - 6, 22);
  ctx.closePath();
  ctx.fill();
  // Team-color belt
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(cx - 6, 19, 12, 3);

  // ── Left arm ──
  ctx.fillStyle = SKIN;
  ctx.fillRect(cx - 9, 14, 3, 7);

  // ── Axe (right side) ──
  // Handle
  ctx.fillStyle = WD_M;
  ctx.fillRect(cx + 7, 5, 2, 14);
  // Head (metal)
  ctx.fillStyle = MT_L;
  ctx.beginPath();
  ctx.moveTo(cx + 6,  5);
  ctx.lineTo(cx + 14, 3);
  ctx.lineTo(cx + 14, 11);
  ctx.lineTo(cx + 6,  12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = MT_HL;
  ctx.fillRect(cx + 7, 3, 6, 2); // highlight on blade top
  ctx.fillStyle = MT_D;
  ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();

  // ── Head ──
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(cx, 10, 6, 0, Math.PI * 2);
  ctx.fill();
  // Hair
  ctx.fillStyle = '#3a1c08';
  ctx.beginPath();
  ctx.arc(cx, 9, 6, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - 6, 6, 12, 3); // top of hair
  // Eyes
  ctx.fillStyle = INK;
  ctx.fillRect(cx - 3, 11, 2, 1);
  ctx.fillRect(cx + 1, 11, 2, 1);

  // Faint outline around head
  ctx.strokeStyle = '#2a1408';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(cx, 10, 6, 0, Math.PI * 2);
  ctx.stroke();

  return c;
}

function makeFootman(T: number, owner: 0 | 1): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  const cx = T / 2;

  unitShadow(ctx, T);

  // ── Legs (armored greaves) ──
  ctx.fillStyle = TC_D[owner];
  ctx.fillRect(cx - 5, 19, 5, 8);
  ctx.fillRect(cx + 1, 19, 5, 8);
  // Boots (steel toe)
  ctx.fillStyle = MT_M;
  ctx.fillRect(cx - 6, 26, 7, 3);
  ctx.fillRect(cx,     26, 7, 3);

  // ── Shield (left side) ──
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(cx - 12, 12, 7, 11);
  // Shield boss (gold center)
  ctx.fillStyle = GD_L;
  ctx.beginPath();
  ctx.arc(cx - 8, 17, 2, 0, Math.PI * 2);
  ctx.fill();
  // Shield rim
  ctx.strokeStyle = TC_D[owner]; ctx.lineWidth = 1;
  ctx.strokeRect(cx - 12, 12, 7, 11);

  // ── Armored torso ──
  ctx.fillStyle = TC_M[owner];
  ctx.beginPath();
  ctx.moveTo(cx - 6, 12);
  ctx.lineTo(cx + 8, 12);
  ctx.lineTo(cx + 7, 21);
  ctx.lineTo(cx - 5, 21);
  ctx.closePath();
  ctx.fill();
  // Chest highlight
  ctx.fillStyle = TC_L[owner];
  ctx.fillRect(cx - 4, 13, 8, 2);
  // Belt buckle
  ctx.fillStyle = GD_L;
  ctx.fillRect(cx - 1, 20, 3, 2);

  // ── Sword arm (right) ──
  ctx.fillStyle = MT_M;
  ctx.fillRect(cx + 7, 14, 3, 8);
  // Sword blade
  ctx.fillStyle = MT_HL;
  ctx.fillRect(cx + 9, 5, 2, 13);
  ctx.fillStyle = GD_L;
  ctx.fillRect(cx + 8, 13, 4, 2); // crossguard
  ctx.fillStyle = WD_M;
  ctx.fillRect(cx + 9, 15, 2, 4); // grip

  // ── Helmet ──
  ctx.fillStyle = MT_M;
  ctx.beginPath();
  ctx.arc(cx + 1, 9, 7, 0, Math.PI * 2);
  ctx.fill();
  // Helmet dome highlight
  ctx.fillStyle = MT_L;
  ctx.beginPath();
  ctx.arc(cx - 1, 7, 4, 0, Math.PI * 2);
  ctx.fill();
  // Nose guard
  ctx.fillStyle = MT_D;
  ctx.fillRect(cx + 1, 10, 2, 5);
  // Cheek guards
  ctx.fillStyle = MT_M;
  ctx.fillRect(cx - 4, 12, 4, 4);
  ctx.fillRect(cx + 4, 12, 4, 4);
  // Eyes (visor slit)
  ctx.fillStyle = INK;
  ctx.fillRect(cx - 3, 10, 3, 1);
  ctx.fillRect(cx + 3, 10, 3, 1);

  return c;
}

function makeArcher(T: number, owner: 0 | 1): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  const cx = T / 2;

  unitShadow(ctx, T);

  // ── Legs (leather) ──
  ctx.fillStyle = '#4a3010';
  ctx.fillRect(cx - 4, 19, 3, 8);
  ctx.fillRect(cx + 1, 19, 3, 8);
  // Boots
  ctx.fillStyle = '#1c0c04';
  ctx.fillRect(cx - 5, 26, 5, 3);
  ctx.fillRect(cx + 1, 26, 5, 3);

  // ── Cloak/Tunic (green ranger style) ──
  ctx.fillStyle = GR_D;
  ctx.beginPath();
  ctx.moveTo(cx - 6, 13);
  ctx.lineTo(cx + 6, 13);
  ctx.lineTo(cx + 5, 22);
  ctx.lineTo(cx - 5, 22);
  ctx.closePath();
  ctx.fill();
  // Team color trim on cloak
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(cx - 6, 13, 2, 9);
  ctx.fillRect(cx + 4, 13, 2, 9);

  // ── Bow (left side, arc shape) ──
  ctx.strokeStyle = WD_M;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx - 11, 14, 9, -Math.PI * 0.55, Math.PI * 0.55);
  ctx.stroke();
  // Bow string
  ctx.strokeStyle = 'rgba(200,180,140,0.8)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - 11 + 9 * Math.cos(-Math.PI * 0.55), 14 + 9 * Math.sin(-Math.PI * 0.55));
  ctx.lineTo(cx - 11 + 9 * Math.cos(Math.PI * 0.55),  14 + 9 * Math.sin(Math.PI * 0.55));
  ctx.stroke();
  // Arrow on bow
  ctx.strokeStyle = WD_L;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 5, 7);
  ctx.lineTo(cx - 5, 20);
  ctx.stroke();
  ctx.fillStyle = MT_L;
  ctx.fillRect(cx - 6, 6, 3, 3);  // arrowhead

  // ── Quiver (right side) ──
  ctx.fillStyle = WD_D;
  ctx.fillRect(cx + 5, 13, 4, 8);
  ctx.fillStyle = WD_M;
  ctx.fillRect(cx + 6, 11, 2, 3); // arrow tails
  ctx.fillRect(cx + 7, 10, 1, 4);

  // ── Hood + head ──
  ctx.fillStyle = GR_VD;
  ctx.beginPath();
  ctx.arc(cx, 9, 7, 0, Math.PI * 2);
  ctx.fill();
  // Hood peak (pointed)
  ctx.beginPath();
  ctx.moveTo(cx - 5, 6);
  ctx.lineTo(cx, 0);
  ctx.lineTo(cx + 5, 6);
  ctx.fill();
  // Team color trim on hood
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(cx - 7, 12, 14, 2);
  // Face (small window in hood)
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(cx, 10, 4, 0, Math.PI * 2);
  ctx.fill();
  // Eyes
  ctx.fillStyle = INK;
  ctx.fillRect(cx - 2, 10, 1, 1);
  ctx.fillRect(cx + 1, 10, 1, 1);

  return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILDINGS
// ═══════════════════════════════════════════════════════════════════════════════

function makeTownhall(T: number, owner: 0 | 1): HTMLCanvasElement {
  const W = T * 3; const H = T * 3;
  const [c, ctx] = oc(W, H);

  // ── Foundation / base stone ──
  stoneTexture(ctx, 0, 0, W, H, ST_VD, ST_D, ST_M, 8, 13);

  // ── Corner towers ──
  const tower = (tx: number, ty: number, tr: number) => {
    ctx.fillStyle = ST_D;
    ctx.beginPath();
    ctx.arc(tx, ty, tr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ST_M;
    ctx.beginPath();
    ctx.arc(tx - 2, ty - 2, tr - 3, 0, Math.PI * 2);
    ctx.fill();
    // Crenels around tower top
    ctx.fillStyle = ST_L;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      ctx.fillRect(
        tx + Math.cos(ang) * (tr - 2) - 2,
        ty + Math.sin(ang) * (tr - 2) - 2, 4, 4,
      );
    }
    // Team color flag on each corner
    ctx.fillStyle = TC_M[owner];
    ctx.fillRect(tx - 1, ty - tr - 8, 2, 8);
    ctx.fillStyle = TC_L[owner];
    ctx.beginPath();
    ctx.moveTo(tx + 1, ty - tr - 8);
    ctx.lineTo(tx + 7, ty - tr - 5);
    ctx.lineTo(tx + 1, ty - tr - 2);
    ctx.fill();
  };
  tower(14, 14, 12);
  tower(W - 14, 14, 12);
  tower(14, H - 14, 11);
  tower(W - 14, H - 14, 11);

  // ── Central hall roof ──
  ctx.fillStyle = ST_M;
  ctx.fillRect(22, 22, W - 44, H - 44);
  // Roof peak (darker center stripe)
  ctx.fillStyle = ST_D;
  ctx.fillRect(W / 2 - 3, 22, 6, H - 44);
  // Roof highlight ridge
  ctx.fillStyle = ST_HL;
  ctx.fillRect(W / 2 - 1, 22, 2, H - 44);

  // ── Gate arch at bottom center ──
  ctx.fillStyle = ST_VD;
  // Arch shape
  ctx.beginPath();
  ctx.rect(W / 2 - 10, H - 22, 20, 22);
  ctx.fill();
  ctx.fillStyle = '#080604';
  ctx.beginPath();
  ctx.arc(W / 2, H - 22, 10, Math.PI, 0, false);
  ctx.fill();
  // Door frame
  ctx.strokeStyle = ST_M; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, H - 22, 10, Math.PI, 0, false);
  ctx.stroke();
  ctx.strokeRect(W / 2 - 10, H - 22, 20, 22);

  // ── Team color banner above gate ──
  ctx.fillStyle = TC_D[owner];
  ctx.fillRect(W / 2 - 12, H - 36, 24, 10);
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(W / 2 - 10, H - 35, 20, 8);
  // Cross emblem
  ctx.fillStyle = TC_HL[owner];
  ctx.fillRect(W / 2 - 1, H - 35, 2, 8);
  ctx.fillRect(W / 2 - 5, H - 32, 10, 2);

  // ── Window slits ──
  ctx.fillStyle = '#040404';
  for (const [wx, wy] of [[24, 30], [W-28, 30], [24, H-36], [W-28, H-36]]) {
    ctx.fillRect(wx, wy, 4, 8);
    ctx.fillRect(wx + 1, wy - 1, 2, 1); // arch top
  }

  // ── Outer wall top crenellations ──
  ctx.fillStyle = ST_M;
  crenels(ctx, 2, 6, W - 4, 6, 8);
  // Bottom edge shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, H - 3, W, 3);
  ctx.fillRect(W - 3, 0, 3, H);

  return c;
}

function makeBarracks(T: number, owner: 0 | 1): HTMLCanvasElement {
  const W = T * 3; const H = T * 2;
  const [c, ctx] = oc(W, H);

  stoneTexture(ctx, 0, 0, W, H, ST_VD, ST_D, ST_L, 9, 14);

  // ── Flat roof with raised battlements ──
  ctx.fillStyle = ST_M;
  ctx.fillRect(0, 0, W, 14);
  ctx.fillStyle = ST_L;
  ctx.fillRect(0, 0, W, 4);  // highlight
  crenels(ctx, 2, 10, W - 4, 7, 9);

  // ── Front wall ──
  ctx.fillStyle = ST_D;
  ctx.fillRect(2, 14, W - 4, H - 14);

  // ── Main gate (wide double door) ──
  const gx = W / 2 - 12;
  ctx.fillStyle = WD_D;
  ctx.fillRect(gx, H - 26, 24, 26);
  ctx.fillStyle = WD_M;
  ctx.fillRect(gx + 2, H - 24, 10, 24);
  ctx.fillRect(gx + 14, H - 24, 10, 24);
  // Door studs
  ctx.fillStyle = MT_M;
  for (const [dx, dy] of [[3, 6], [3, 14], [3, 20], [11, 6], [11, 14], [11, 20]]) {
    ctx.beginPath();
    ctx.arc(gx + dx + 2, H - 24 + dy, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // For right door panel
  for (const [dx, dy] of [[17, 6], [17, 14], [17, 20], [23, 6], [23, 14], [23, 20]]) {
    ctx.beginPath();
    ctx.arc(gx + dx - 2, H - 24 + dy, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Door frame
  ctx.strokeStyle = ST_VD; ctx.lineWidth = 2;
  ctx.strokeRect(gx, H - 26, 24, 26);

  // ── Arrow slits ──
  ctx.fillStyle = '#040404';
  for (const wx of [14, W - 18]) {
    ctx.fillRect(wx, H - 36, 4, 12);
    ctx.fillRect(wx - 2, H - 34, 8, 4);  // horizontal slit
  }

  // ── Flagpole + pennant ──
  ctx.fillStyle = WD_L;
  ctx.fillRect(W - 14, 0, 2, 22);
  ctx.fillStyle = TC_M[owner];
  ctx.beginPath();
  ctx.moveTo(W - 12, 2);
  ctx.lineTo(W - 2,  8);
  ctx.lineTo(W - 12, 14);
  ctx.fill();
  ctx.fillStyle = TC_HL[owner];
  ctx.fillRect(W - 12, 2, 8, 3);

  // ── Corner pilasters ──
  ctx.fillStyle = ST_L;
  ctx.fillRect(0, 14, 6, H - 14);
  ctx.fillRect(W - 6, 14, 6, H - 14);
  // Highlight on left pilaster
  ctx.fillStyle = ST_HL;
  ctx.fillRect(0, 14, 2, H - 14);

  // Bottom shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(0, H - 2, W, 2);

  return c;
}

function makeFarm(T: number, owner: 0 | 1): HTMLCanvasElement {
  const W = T * 2; const H = T * 2;
  const [c, ctx] = oc(W, H);

  // ── Crop field (alternating rows) ──
  ctx.fillStyle = '#2a4c10';
  ctx.fillRect(0, 0, W, H);
  for (let row = 0; row < 7; row++) {
    ctx.fillStyle = row % 2 === 0 ? '#3a6418' : '#2a4c10';
    ctx.fillRect(18, row * 9, W - 20, 9);
    // Crop dots
    ctx.fillStyle = '#4a8020';
    for (let col = 0; col < 5; col++) {
      ctx.fillRect(20 + col * 8, row * 9 + 3, 3, 3);
    }
  }

  // ── Fence ──
  ctx.fillStyle = WD_M;
  ctx.fillRect(0, 0, W, 3);           // top rail
  ctx.fillRect(0, H - 3, W, 3);       // bottom rail
  ctx.fillRect(0, 0, 3, H);           // left rail
  ctx.fillRect(W - 3, 0, 3, H);       // right rail
  // Fence posts
  ctx.fillStyle = WD_L;
  for (let x = 0; x < W; x += 10) {
    ctx.fillRect(x, 0, 3, H);         // only posts on verticals
  }
  ctx.fillStyle = WD_L;
  for (let y = 10; y < H - 10; y += 10) {
    ctx.fillRect(0, y, W, 2);         // horizontal fence boards
  }

  // ── Farmhouse (upper-left) ──
  ctx.fillStyle = '#603010'; // log walls
  ctx.fillRect(0, 0, 18, 36);
  stoneTexture(ctx, 1, 1, 16, 34, '#4a2008', WD_M, WD_L, 7, 8);
  // Roof (pitched, team color) - drawn as trapezoid
  ctx.fillStyle = TC_D[owner];
  ctx.beginPath();
  ctx.moveTo(-1, 16);
  ctx.lineTo(9, 4);
  ctx.lineTo(19, 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = TC_M[owner];
  ctx.beginPath();
  ctx.moveTo(0, 16);
  ctx.lineTo(9, 5);
  ctx.lineTo(18, 16);
  ctx.closePath();
  ctx.fill();
  // Ridge line
  ctx.fillStyle = TC_HL[owner];
  ctx.fillRect(8, 4, 2, 12);
  // Door
  ctx.fillStyle = WD_D;
  ctx.fillRect(4, 24, 8, 12);
  ctx.fillStyle = '#080400';
  ctx.fillRect(5, 25, 6, 11);
  // Window
  ctx.fillStyle = '#a0c8e8';
  ctx.fillRect(10, 20, 6, 6);
  ctx.fillStyle = WD_D;
  ctx.fillRect(12, 20, 1, 6); // cross
  ctx.fillRect(10, 23, 6, 1);

  // ── Team color weathervane / sign ──
  ctx.fillStyle = TC_M[owner];
  ctx.fillRect(8, 0, 2, 5);

  return c;
}

function makeWall(T: number, owner: 0 | 1): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);

  stoneTexture(ctx, 0, 6, T, T - 6, ST_D, ST_M, ST_HL, 8, 12);

  // ── Crenellations (top, 3 merlons) ──
  ctx.fillStyle = ST_M;
  ctx.fillRect(0, 0, 9, 10);
  ctx.fillRect(11, 0, 10, 10);
  ctx.fillRect(23, 0, 9, 10);
  ctx.fillStyle = ST_L;
  ctx.fillRect(0, 0, 9, 2);
  ctx.fillRect(11, 0, 10, 2);
  ctx.fillRect(23, 0, 9, 2);

  // ── Team color top edge ──
  ctx.fillStyle = TC_D[owner];
  ctx.fillRect(0, 0, T, 2);

  // ── Dark gaps between merlons ──
  ctx.fillStyle = ST_VD;
  ctx.fillRect(9, 0, 2, 10);
  ctx.fillRect(21, 0, 2, 10);

  // Side shadows
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(T - 2, 0, 2, T);
  ctx.fillRect(0, T - 2, T, 2);

  return c;
}

function makeGoldmine(T: number): HTMLCanvasElement {
  const W = T * 2; const H = T * 2;
  const [c, ctx] = oc(W, H);

  // ── Rocky hillside ──
  stoneTexture(ctx, 0, 0, W, H, '#282018', '#3c3020', '#504838', 9, 14);

  // ── Mine entrance (dark arch) ──
  const ex = W / 2 - 14; const ew = 28;
  const ey = H / 2 - 4;  const eh = H / 2 + 4;
  ctx.fillStyle = '#080604';
  ctx.fillRect(ex, ey, ew, eh);
  ctx.beginPath();
  ctx.arc(W / 2, ey, 14, Math.PI, 0);
  ctx.fill();
  // Arch glow (gold)
  ctx.strokeStyle = GD_L; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(W / 2, ey, 14, Math.PI, 0);
  ctx.stroke();
  ctx.strokeRect(ex, ey, ew, eh);
  // Inner glow
  ctx.strokeStyle = GD_HL; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(W / 2, ey, 12, Math.PI, 0);
  ctx.stroke();

  // ── Wooden support frame ──
  ctx.fillStyle = WD_M;
  ctx.fillRect(ex - 2, ey - 2, 4, eh + 4);  // left post
  ctx.fillRect(ex + ew - 2, ey - 2, 4, eh + 4); // right post
  ctx.fillRect(ex - 2, ey - 4, ew + 6, 4);  // top beam
  // Wood detail
  ctx.fillStyle = WD_L;
  ctx.fillRect(ex - 1, ey - 2, 1, eh + 2);
  ctx.fillRect(ex + ew - 1, ey - 2, 1, eh + 2);

  // ── Gold nuggets scattered around entrance ──
  const nuggets: Array<[number, number]> = [
    [ex - 8, ey + 6], [ex + ew + 4, ey + 8],
    [W / 2 - 4, ey - 8], [W / 2 + 4, ey - 6],
    [ex + 4, ey + eh + 2], [ex + ew - 8, ey + eh],
  ];
  for (const [nx, ny] of nuggets) {
    ctx.fillStyle = GD_D;
    ctx.fillRect(nx, ny, 5, 4);
    ctx.fillStyle = GD_L;
    ctx.fillRect(nx + 1, ny, 3, 2);
    ctx.fillStyle = GD_HL;
    ctx.fillRect(nx + 1, ny, 2, 1);
  }

  // ── Rock details (cracks and facets) ──
  ctx.fillStyle = '#1a1408';
  ctx.fillRect(8, 4, 1, 20);
  ctx.fillRect(W - 9, 8, 1, 16);

  return c;
}

function makeCorpse(T: number): HTMLCanvasElement {
  const [c, ctx] = oc(T, T);
  // Small dark cross/X shape
  ctx.fillStyle = '#404040';
  ctx.save();
  ctx.translate(T / 2, T / 2);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-6, -2, 12, 4);
  ctx.fillRect(-2, -6, 4, 12);
  ctx.restore();
  ctx.fillStyle = '#202020';
  ctx.save();
  ctx.translate(T / 2, T / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.fillRect(-4, -1, 8, 3);
  ctx.fillRect(-1, -4, 3, 8);
  ctx.restore();
  return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

export function buildSpriteCache(T: number): SpriteCache {
  return {
    // Terrain
    grass:    makeGrass(T),
    tree:     makeTree(T),
    water:    [0, 1, 2, 3].map(f => makeWater(T, f)),
    rock:     makeRock(T),
    goldtile: makeGoldTile(T),
    // Units
    worker:   [makeWorker(T, 0), makeWorker(T, 1)],
    footman:  [makeFootman(T, 0), makeFootman(T, 1)],
    archer:   [makeArcher(T, 0), makeArcher(T, 1)],
    // Buildings
    townhall: [makeTownhall(T, 0), makeTownhall(T, 1)],
    barracks: [makeBarracks(T, 0), makeBarracks(T, 1)],
    farm:     [makeFarm(T, 0), makeFarm(T, 1)],
    wall:     [makeWall(T, 0), makeWall(T, 1)],
    // Neutral
    goldmine: makeGoldmine(T),
    // FX
    corpse:   makeCorpse(T),
  };
}
