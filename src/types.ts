// ─── Constants ────────────────────────────────────────────────────────────────

export const TILE_SIZE = 32;
export const MAP_W = 64;
export const MAP_H = 64;
export const SIM_HZ = 20;
export const SIM_TICK_MS = 1000 / SIM_HZ; // 50ms
export const CORPSE_LIFE_TICKS  = SIM_HZ * 3;   // 3 seconds
export const MINE_GOLD_INITIAL  = 1500;
export const GATHER_AMOUNT      = 8;             // gold per trip
export const GATHER_TICKS       = SIM_HZ * 2;   // 2s at mine

// ─── Map ──────────────────────────────────────────────────────────────────────

export type TileKind = 'grass' | 'tree' | 'water' | 'goldmine' | 'rock';
export type FogState = 'unseen' | 'explored' | 'visible';

export interface Tile {
  kind: TileKind;
  passable: boolean;
}

// ─── Geometry ─────────────────────────────────────────────────────────────────

export interface Vec2 {
  x: number;
  y: number;
}

// ─── Entities ─────────────────────────────────────────────────────────────────

export type Owner = 0 | 1; // 0 = player, 1 = AI

export type EntityKind =
  | 'worker' | 'footman' | 'archer'                    // units
  | 'townhall' | 'barracks' | 'farm' | 'wall'          // buildings
  | 'goldmine';                                         // resource node

/** Set of entity kinds that are actual mobile combat/worker units. */
export const UNIT_KINDS = new Set<EntityKind>(['worker', 'footman', 'archer']);
export function isUnitKind(kind: EntityKind): boolean { return UNIT_KINDS.has(kind); }

export type Command =
  | { type: 'move';    path: Vec2[]; stepTick: number; attackMove: boolean }
  | { type: 'attack';  targetId: number; cooldownTick: number; chasePath: Vec2[]; chasePathTick: number }
  | { type: 'gather';  mineId: number; phase: 'tomine' | 'gathering' | 'returning'; waitTicks: number }
  | { type: 'build';   building: EntityKind; pos: Vec2; ticksLeft: number; phase: 'moving' | 'building'; stepTick: number }
  | { type: 'train';   unit: EntityKind; ticksLeft: number; queue: EntityKind[] };

export interface Entity {
  id: number;
  kind: EntityKind;
  owner: Owner;
  pos: Vec2;
  tileW: number;
  tileH: number;
  hp: number;
  hpMax: number;
  cmd: Command | null;
  sightRadius: number;
  goldReserve?: number;   // gold mines only
  carryGold?: number;     // workers carrying gold back
}

// ─── Corpse ───────────────────────────────────────────────────────────────────

export interface Corpse {
  pos: Vec2;
  owner: Owner;
  deadTick: number;
}

// ─── Game State ───────────────────────────────────────────────────────────────

export interface GameState {
  tick: number;
  tiles: Tile[][];
  fog:   FogState[][];
  entities: Entity[];
  corpses: Corpse[];
  nextId: number;
  gold:   [number, number];
  pop:    [number, number];
  popCap: [number, number];
}
