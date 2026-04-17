import type { GameState, FogState } from '../types';
import { MAP_W, MAP_H } from '../types';
import { buildMap01 } from '../data/maps/map01';

export function createWorld(): GameState {
  const tiles = buildMap01();

  const fog: FogState[][] = Array.from({ length: MAP_H }, () =>
    Array.from<FogState>({ length: MAP_W }).fill('unseen'),
  );

  return {
    tick: 0,
    tiles,
    fog,
    entities: [],
    corpses: [],
    nextId: 1,
    gold:   [500, 200],
    pop:    [0, 0],
    popCap: [4, 4],
  };
}
