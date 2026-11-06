/**
 * Boot: canvas scaling, input wiring, fixed-step loop.
 *
 * `mountGame` owns every listener and the animation frame, and returns the teardown React's effect
 * cleanup calls. Nothing here touches module scope, so the page can mount and unmount the game as
 * often as the router does.
 */

import { Sound } from "./audio";
import { Game, MENU_ROW_HEIGHT, MENU_ROW_TOP, STATE } from "./game";
import type { ScoreBoard } from "./scores";

const STEP = 1 / 60;
/** Room under the canvas for the hint line, in CSS pixels. */
const CHROME_HEIGHT = 70;

const KEYMAP: Readonly<Record<string, "left" | "right" | "up" | "down">> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
};

export interface MountedGame {
  readonly game: Game;
  /** Removes every listener and stops the loop. */
  readonly destroy: () => void;
}

/**
 * Starts the game on `canvas`, or returns `null` where there is no 2D context to draw into — a
 * browser with canvas turned off, or a server-side renderer. The caller shows a fallback rather
 * than the page failing.
 */
export const mountGame = (
  canvas: HTMLCanvasElement,
  scores?: ScoreBoard
): MountedGame | null => {
  if (!canvas.getContext("2d")) {
    return null;
  }

  const game = new Game(canvas, scores);

  /* --------------------------------------------------------------- scaling */
  // Integer scale only: a fractional one resamples the pixel grid and the art goes soft.
  const resize = (): void => {
    const maxW = window.innerWidth - 20;
    const maxH = window.innerHeight - CHROME_HEIGHT;
    const scale = Math.max(
      1,
      Math.floor(Math.min(maxW / canvas.width, maxH / canvas.height))
    );
    canvas.style.width = `${canvas.width * scale}px`;
    canvas.style.height = `${canvas.height * scale}px`;
  };

  resize();
  window.addEventListener("resize", resize);

  /* ----------------------------------------------------------------- input */
  // Browsers only allow audio after a gesture, so the context is created on the first one.
  const firstGesture = (): void => {
    Sound.resume();

    if (game.state === STATE.SPLASH || game.state === STATE.MENU) {
      Sound.music("menu");
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    firstGesture();
    const direction = KEYMAP[event.code];

    if (direction) {
      event.preventDefault();
      game.input[direction] = true;
      game.press(direction);

      return;
    }

    if (
      event.code === "Enter" ||
      event.code === "NumpadEnter" ||
      event.code === "Space"
    ) {
      event.preventDefault();
      game.press("confirm");

      return;
    }

    if (event.code === "Escape" || event.code === "Backspace") {
      event.preventDefault();
      game.press("back");

      return;
    }

    if (event.code === "KeyM") {
      if (!Sound.toggleMute()) {
        Sound.music(game.state === STATE.PLAY ? "game" : "menu");
      }

      return;
    }

    if (game.state === STATE.ENTRY && event.key.length === 1) {
      game.typeChar(event.key);
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    const direction = KEYMAP[event.code];

    if (direction) {
      game.input[direction] = false;
    }
  };

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  /* --------------------------------------------------------------- pointer */
  const canvasPoint = (
    clientX: number,
    clientY: number
  ): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();

    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const pointerDown = (clientX: number, clientY: number): void => {
    firstGesture();

    if (game.state === STATE.PLAY) {
      const point = canvasPoint(clientX, clientY);
      game.input.pointer = true;
      game.input.pointerX = point.x;
      game.input.pointerY = point.y;

      return;
    }

    if (game.state === STATE.MENU) {
      const point = canvasPoint(clientX, clientY);
      const row = Math.floor((point.y - (MENU_ROW_TOP - 4)) / MENU_ROW_HEIGHT);

      if (row >= 0 && row < game.menuItems.length) {
        game.menuIndex = row;
        game.press("confirm");
      }

      return;
    }

    game.press("any");
  };

  const onTouchStart = (event: TouchEvent): void => {
    event.preventDefault();
    const touch = event.changedTouches[0];

    if (touch) {
      pointerDown(touch.clientX, touch.clientY);
    }
  };

  const onTouchMove = (event: TouchEvent): void => {
    event.preventDefault();
    const touch = event.changedTouches[0];

    if (touch) {
      const point = canvasPoint(touch.clientX, touch.clientY);
      game.input.pointerX = point.x;
      game.input.pointerY = point.y;
    }
  };

  const onTouchEnd = (event: TouchEvent): void => {
    event.preventDefault();
    game.input.pointer = false;
  };

  const onMouseDown = (event: MouseEvent): void => {
    pointerDown(event.clientX, event.clientY);
  };

  const onMouseMove = (event: MouseEvent): void => {
    if (!game.input.pointer) {
      return;
    }

    const point = canvasPoint(event.clientX, event.clientY);
    game.input.pointerX = point.x;
    game.input.pointerY = point.y;
  };

  const onMouseUp = (): void => {
    game.input.pointer = false;
  };

  // A tab switch mid-press would otherwise leave the flip flop steering into a wall forever.
  const onBlur = (): void => {
    game.input.left = false;
    game.input.right = false;
    game.input.up = false;
    game.input.down = false;
    game.input.pointer = false;
  };

  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("blur", onBlur);

  /* ------------------------------------------------------------------ loop */
  let frameId = 0;
  let last = 0;
  let accumulator = 0;

  const frame = (now: number): void => {
    if (!last) {
      last = now;
    }

    // Clamped: a backgrounded tab returns with a huge delta, which would otherwise be simulated.
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    accumulator += dt;

    let steps = 0;

    while (accumulator >= STEP && steps < 5) {
      game.update(STEP);
      accumulator -= STEP;
      steps++;
    }

    if (steps >= 5) {
      accumulator = 0;
    }

    game.draw();
    frameId = window.requestAnimationFrame(frame);
  };

  frameId = window.requestAnimationFrame(frame);

  return {
    game,
    destroy: () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onBlur);
      Sound.stopMusic();
    },
  };
};
