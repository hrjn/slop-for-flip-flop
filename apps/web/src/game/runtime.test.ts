/**
 * The boot layer: canvas scaling, input wiring, the loop, and teardown.
 *
 * Ported from the old `devtools/selftest.cjs` "boot layer" checks, which drove `main.js` through a
 * stubbed `document`. Here the listeners are real: jsdom dispatches the events.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { Sound } from "./audio";
import { STATE } from "./game";
import { mountGame } from "./runtime";
import { ScoreBoard } from "./scores";
import { recordingCanvas } from "./test-canvas";
import type { MountedGame } from "./runtime";

const FRAME = 1 / 60;

let mounted: MountedGame | null = null;

/** A booted game on a recording canvas, torn down after the test. */
const boot = (): MountedGame & { canvas: HTMLCanvasElement } => {
  const canvas = recordingCanvas();
  document.body.append(canvas);
  mounted = mountGame(canvas, new ScoreBoard());

  if (!mounted) {
    throw new Error("the game refused to mount on a recording canvas");
  }

  return { ...mounted, canvas };
};

const key = (code: string, init: KeyboardEventInit = {}): void => {
  document.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      code,
      key: code,
      bubbles: true,
      cancelable: true,
      ...init,
    })
  );
};

const keyUp = (code: string): void => {
  document.dispatchEvent(
    new window.KeyboardEvent("keyup", { code, key: code, bubbles: true })
  );
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  mounted?.destroy();
  mounted = null;
  document.body.replaceChildren();
});

describe("mountGame", () => {
  test("refuses a canvas with no 2D context, rather than throwing", () => {
    const canvas = document.createElement("canvas");

    // jsdom implements no canvas, so its `getContext` already answers null.
    expect(mountGame(canvas)).toBeNull();
  });

  test("scales the canvas to a whole number of pixels", () => {
    const { canvas } = boot();

    expect(canvas.style.width).toMatch(/^\d+px$/u);
    expect(Number.parseInt(canvas.style.width, 10)).toBeGreaterThanOrEqual(
      canvas.width
    );
  });

  test("Enter walks splash -> menu -> intro -> play", () => {
    const { game } = boot();

    key("Enter");

    expect(game.state).toBe(STATE.MENU);

    key("Enter");

    expect(game.state).toBe(STATE.INTRO);

    key("Enter");

    expect(game.state).toBe(STATE.PLAY);
  });

  test("arrow keys steer, and releasing one stops the steering", () => {
    const { game } = boot();
    key("Enter");
    key("Enter");
    key("Enter");

    key("ArrowLeft");

    expect(game.input.left).toBe(true);

    const startX = game.player.x;

    for (let i = 0; i < 30; i++) {
      game.update(FRAME);
    }

    expect(game.player.x).toBeLessThan(startX);

    keyUp("ArrowLeft");

    expect(game.input.left).toBe(false);
  });

  test("WASD works as an alternative", () => {
    const { game } = boot();
    key("Enter");
    key("Enter");
    key("Enter");

    key("KeyD");

    expect(game.input.right).toBe(true);

    keyUp("KeyD");

    expect(game.input.right).toBe(false);
  });

  test("Escape leaves a run back to the menu", () => {
    const { game } = boot();
    key("Enter");
    key("Enter");
    key("Enter");
    key("Escape");

    expect(game.state).toBe(STATE.MENU);
  });

  test("M toggles mute both ways", () => {
    boot();
    const before = Sound.isMuted();

    key("KeyM");

    expect(Sound.isMuted()).not.toBe(before);

    key("KeyM");

    expect(Sound.isMuted()).toBe(before);
  });

  test("typing a letter fills the initials", () => {
    const { game } = boot();
    game.pendingScore = 900;
    game.pendingKm = 9;
    game.setState(STATE.ENTRY);

    key("KeyQ", { key: "q" });

    expect(game.entryName[0]).toBe("Q");
  });

  test("a window blur releases every held key", () => {
    const { game } = boot();
    key("Enter");
    key("Enter");
    key("Enter");
    key("ArrowRight");

    window.dispatchEvent(new window.Event("blur"));

    expect(game.input.right).toBe(false);
  });

  test("destroy stops the listeners", () => {
    const { game, destroy } = boot();
    mounted = null;
    destroy();

    const before = game.state;
    key("Enter");

    expect(game.state).toBe(before);
  });
});
