const DRAG_THRESHOLD = 5; // pixels of travel before it becomes a drag

export interface ClickEvent {
  x: number; y: number;
  button: 0 | 2;
}

export interface DragSelectEvent {
  x1: number; y1: number; // screen-space, always top-left ≤ bottom-right
  x2: number; y2: number;
}

export interface MouseState {
  x: number;
  y: number;
  buttons: number;
  onCanvas: boolean;
  shiftHeld: boolean;
  clicks: ClickEvent[];
  dragSelects: DragSelectEvent[];
  /** Non-null while left-button is held and dragging — used to draw live box. */
  activeDrag: { x1: number; y1: number; x2: number; y2: number } | null;
}

export function createMouseState(canvas: HTMLCanvasElement): MouseState {
  const state: MouseState = {
    x: 0, y: 0, buttons: 0, onCanvas: false, shiftHeld: false,
    clicks: [], dragSelects: [], activeDrag: null,
  };

  window.addEventListener('keydown', (e) => { if (e.key === 'Shift') state.shiftHeld = true; });
  window.addEventListener('keyup',   (e) => { if (e.key === 'Shift') state.shiftHeld = false; });

  let downX = 0;
  let downY = 0;
  let leftHeld = false;

  canvas.addEventListener('mouseenter', () => { state.onCanvas = true; });
  canvas.addEventListener('mouseleave', () => { state.onCanvas = false; state.buttons = 0; state.activeDrag = null; leftHeld = false; });

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    state.x = e.clientX - r.left;
    state.y = e.clientY - r.top;
    state.buttons = e.buttons;

    if (leftHeld) {
      const dx = state.x - downX;
      const dy = state.y - downY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        state.activeDrag = {
          x1: Math.min(downX, state.x), y1: Math.min(downY, state.y),
          x2: Math.max(downX, state.x), y2: Math.max(downY, state.y),
        };
      }
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    state.buttons = e.buttons;

    if (e.button === 0) {
      downX = x; downY = y; leftHeld = true;
    } else if (e.button === 2) {
      state.clicks.push({ x, y, button: 2 });
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    state.buttons = e.buttons;
    if (e.button === 0 && leftHeld) {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;

      if (state.activeDrag) {
        state.dragSelects.push({ ...state.activeDrag });
        state.activeDrag = null;
      } else {
        state.clicks.push({ x, y, button: 0 });
      }
      leftHeld = false;
    }
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return state;
}
