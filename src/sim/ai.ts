import type { Entity, EntityKind, GameState, Vec2 } from '../types';
import { SIM_HZ, isUnitKind } from '../types';
import { STATS } from '../data/units';
import {
  issueGatherCommand, issueTrainCommand,
  issueBuildCommand, isValidPlacement,
} from './economy';
import { issueAttackCommand } from './combat';
import { issueMoveCommand } from './commands';

// ─── Controller state ─────────────────────────────────────────────────────────

export interface AIController {
  phase:          'economy' | 'military' | 'assault';
  attackWaveSize: number;   // grows each wave: 6 → 8 → 10 → 12
}

export function createAI(): AIController {
  return { phase: 'economy', attackWaveSize: 6 };
}

// ─── Main tick (runs at 1 Hz) ─────────────────────────────────────────────────

export function tickAI(state: GameState, ai: AIController): void {
  if (state.tick % SIM_HZ !== 0) return;

  const es = state.entities;

  const myTH       = es.find(e => e.owner === 1 && e.kind === 'townhall');
  if (!myTH) return; // AI defeated — nothing to do

  const myBarracks = es.find(e  => e.owner === 1 && e.kind === 'barracks');
  const myWorkers  = es.filter(e => e.owner === 1 && e.kind === 'worker');
  const mySoldiers = es.filter(e => e.owner === 1 && (e.kind === 'footman' || e.kind === 'archer'));
  const farmCount  = es.filter(e => e.owner === 1 && e.kind === 'farm').length;

  // Flags: is a worker already tasked with building X?
  const buildingFarm     = myWorkers.some(w => w.cmd?.type === 'build' && w.cmd.building === 'farm');
  const buildingBarracks = myWorkers.some(w => w.cmd?.type === 'build' && w.cmd.building === 'barracks');

  // Always keep workers on gold
  keepGathering(state, myWorkers);

  switch (ai.phase) {
    // ── Economy: build workforce, first farm, first barracks ─────────────────
    case 'economy': {
      // Train workers until we have 4
      if (myWorkers.length < 4) {
        issueTrainCommand(state, myTH, 'worker'); // no-op if can't afford / pop full
      }

      // Build first farm once we have 2 workers (need income first)
      if (farmCount === 0 && !buildingFarm && myWorkers.length >= 2) {
        const w = freeWorker(myWorkers);
        if (w) {
          const pos = findBuildSpot(state, myTH, 'farm');
          if (pos) issueBuildCommand(state, w, 'farm', pos, state.tick);
        }
      }

      // Build barracks once farm exists and we have 3+ workers
      if (farmCount > 0 && !myBarracks && !buildingBarracks && myWorkers.length >= 3) {
        const w = freeWorker(myWorkers);
        if (w) {
          const pos = findBuildSpot(state, myTH, 'barracks');
          if (pos && issueBuildCommand(state, w, 'barracks', pos, state.tick)) {
            ai.phase = 'military';
          }
        }
      }
      break;
    }

    // ── Military: train soldiers, expand pop cap, wait for wave ──────────────
    case 'military': {
      // Train footmen and archers at roughly 2:1 ratio
      if (myBarracks) {
        const footCount   = mySoldiers.filter(u => u.kind === 'footman').length;
        const archerCount = mySoldiers.filter(u => u.kind === 'archer').length;
        const wantArcher  = archerCount < Math.floor(footCount / 2) &&
                            state.gold[1] >= (STATS['archer']?.cost ?? 100);
        issueTrainCommand(state, myBarracks, wantArcher ? 'archer' : 'footman');
      }

      // Build more farms if near pop cap (up to 3 total)
      if (!buildingFarm && state.popCap[1] - state.pop[1] <= 2 && farmCount < 3) {
        const w = freeWorker(myWorkers);
        if (w) {
          const pos = findBuildSpot(state, myTH, 'farm');
          if (pos) issueBuildCommand(state, w, 'farm', pos, state.tick);
        }
      }

      // Launch assault when wave is assembled
      if (mySoldiers.length >= ai.attackWaveSize) {
        ai.phase = 'assault';
      }
      break;
    }

    // ── Assault: send army toward player base ─────────────────────────────────
    case 'assault': {
      const playerTH = es.find(e => e.owner === 0 && e.kind === 'townhall');

      for (const s of mySoldiers) {
        if (s.cmd && s.cmd.type !== 'move') continue; // already fighting — let combat handle it

        // Archers prefer unit targets (they can't attack buildings anyway)
        // Footmen/workers target nearest entity including buildings
        const nearest = s.kind === 'archer'
          ? (nearestPlayerUnit(state, s) ?? nearestPlayerEntity(state, s))
          : nearestPlayerEntity(state, s);

        if (nearest) {
          issueAttackCommand(s, nearest.id, state.tick);
        } else if (playerTH) {
          // No visible enemies yet — march toward base
          issueMoveCommand(state, s, playerTH.pos.x + 1, playerTH.pos.y + 2);
        }
      }

      // Wave wiped out — regroup and increase next wave
      if (mySoldiers.length === 0) {
        ai.attackWaveSize = Math.min(12, ai.attackWaveSize + 2);
        ai.phase = 'military';
      }
      break;
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Send idle or mine-depleted workers back to gold. */
function keepGathering(state: GameState, workers: Entity[]): void {
  for (const w of workers) {
    if (w.cmd && w.cmd.type !== 'gather') continue; // busy with something else

    if (w.cmd?.type === 'gather') {
      const gCmd = w.cmd;
      const mine = state.entities.find(e => e.id === gCmd.mineId);
      if (mine && (mine.goldReserve ?? 0) > 0) continue; // still has gold
    }

    const mine = nearestMine(state, w);
    if (mine) issueGatherCommand(w, mine.id, state.tick);
  }
}

/** A worker that isn't mid-build or mid-combat (idle or gathering). */
function freeWorker(workers: Entity[]): Entity | undefined {
  return workers.find(w => !w.cmd) ?? workers.find(w => w.cmd?.type === 'gather');
}

/** Nearest mine with gold remaining. */
function nearestMine(state: GameState, unit: Entity): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of state.entities) {
    if (e.kind !== 'goldmine' || (e.goldReserve ?? 0) <= 0) continue;
    const d = Math.hypot(e.pos.x - unit.pos.x, e.pos.y - unit.pos.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/**
 * Search in expanding rings around an anchor building for a valid build tile.
 * Returns null if nothing found within radius 12.
 */
function findBuildSpot(state: GameState, anchor: Entity, kind: EntityKind): Vec2 | null {
  for (let r = 2; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring edge only
        const tx = anchor.pos.x + dx;
        const ty = anchor.pos.y + dy;
        if (isValidPlacement(state, kind, tx, ty)) return { x: tx, y: ty };
      }
    }
  }
  return null;
}

/** Nearest player-owned entity (unit or building — but not gold mines). */
function nearestPlayerEntity(state: GameState, unit: Entity): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of state.entities) {
    if (e.owner !== 0 || e.kind === 'goldmine') continue;
    const d = Math.hypot(e.pos.x - unit.pos.x, e.pos.y - unit.pos.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/** Nearest player-owned mobile unit (archers prefer these over buildings). */
function nearestPlayerUnit(state: GameState, unit: Entity): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of state.entities) {
    if (e.owner !== 0 || !isUnitKind(e.kind)) continue;
    const d = Math.hypot(e.pos.x - unit.pos.x, e.pos.y - unit.pos.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}
