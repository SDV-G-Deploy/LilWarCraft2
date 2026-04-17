export interface KeyState {
  ArrowUp:    boolean;
  ArrowDown:  boolean;
  ArrowLeft:  boolean;
  ArrowRight: boolean;
}

const TRACKED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function createKeyState(): KeyState {
  const state: KeyState = {
    ArrowUp: false, ArrowDown: false,
    ArrowLeft: false, ArrowRight: false,
  };

  window.addEventListener('keydown', (e) => {
    if (TRACKED.has(e.key)) {
      (state as unknown as Record<string, boolean>)[e.key] = true;
      e.preventDefault(); // stop page scroll
    }
  });

  window.addEventListener('keyup', (e) => {
    if (TRACKED.has(e.key)) {
      (state as unknown as Record<string, boolean>)[e.key] = false;
    }
  });

  return state;
}
