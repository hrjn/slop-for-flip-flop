/**
 * The gameplay rules, menu flow and rendering, driven headlessly.
 *
 * Ported from the old `devtools/selftest.cjs`, which ran the same assertions in a Node VM. The
 * engine never touches the DOM outside `runtime.ts`, so the whole state machine runs here against
 * a recording context.
 */

import { beforeEach, describe, expect, test } from "bun:test";

import { Pickup, Shark, Surfer, Wave } from "./entities";
import { hasGlyph } from "./font";
import { Game, SPEEDS, STATE, TOTAL_KM } from "./game";
import type { GameState } from "./game";
import { ScoreBoard } from "./scores";
import { recordingCanvas, recordingContext } from "./test-canvas";

const FRAME = 1 / 60;

/** Kilometres back into the `distancePx` the engine counts in. */
const kmToPx = (km: number): number => ((km / 11.5) * 1000) / 0.9;

const newGame = (): Game => new Game(recordingCanvas(), new ScoreBoard());

/** A game already at sea, with a clear deck so a test can place exactly one thing in it. */
const atSea = (game: Game, km = 10): Game => {
  game.reset();
  game.distancePx = kmToPx(km);
  game.setState(STATE.PLAY);
  game.hazards.length = 0;
  game.pickups.length = 0;

  return game;
};

const step = (game: Game, frames: number): void => {
  for (let i = 0; i < frames; i++) {
    game.update(FRAME);
  }
};

const selectMenu = (game: Game, label: string): void => {
  game.setState(STATE.MENU);
  const index = game.menuItems.indexOf(label as (typeof game.menuItems)[number]);

  if (index < 0) {
    throw new Error(`no menu item ${label}`);
  }

  game.menuIndex = index;
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("font", () => {
  test("covers every character the screens draw", () => {
    const used = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:!?+-/<>X";
    const missing = [...new Set(used)].filter((char) => !hasGlyph(char));

    expect(missing).toEqual([]);
  });
});

describe("rendering", () => {
  const screens: GameState[] = [
    STATE.SPLASH,
    STATE.MENU,
    STATE.SCORES,
    STATE.HOWTO,
    STATE.INTRO,
    STATE.PLAY,
    STATE.GAMEOVER,
    STATE.VICTORY,
    STATE.ENTRY,
  ];

  test.each(screens)("draws %s without a non-finite coordinate", (screen) => {
    const game = newGame();
    const context = recordingContext();
    // The constructor took its own context; swap in one this test can read.
    Object.defineProperty(game, "ctx", { value: context, writable: true });

    game.reset();

    if (screen === STATE.INTRO) {
      game.startIntro();
    }

    game.setState(screen);

    if (screen === STATE.PLAY) {
      game.distancePx = 3000;
    }

    if (screen === STATE.GAMEOVER || screen === STATE.VICTORY) {
      game.score = 4242;
      game.stateT = 2;
    }

    if (screen === STATE.ENTRY) {
      game.pendingScore = 4242;
      game.pendingKm = 42;
    }

    for (let i = 0; i < 12; i++) {
      game.update(FRAME);
      game.draw();
    }

    expect(context.recorded.rects).toBeGreaterThan(200);
  });
});

describe("gameplay rules", () => {
  test("a shark costs a life", () => {
    const game = atSea(newGame());
    game.hazards.push(new Shark(game.player.x, game.player.y, 0));
    game.update(FRAME);

    expect(game.lives).toBe(2);
  });

  test("a surfer costs a life", () => {
    const game = atSea(newGame());
    game.hazards.push(new Surfer(game.player.x, game.player.y, 0, 0));
    game.update(FRAME);

    expect(game.lives).toBe(2);
  });

  test("invulnerability prevents an instant second hit", () => {
    const game = atSea(newGame());
    game.hazards.push(new Shark(game.player.x, game.player.y, 0));
    game.update(FRAME);
    const afterFirst = game.lives;
    step(game, 20);

    expect(game.lives).toBe(afterFirst);
  });

  test("a wave gap is passable and its wall is not", () => {
    const game = atSea(newGame());
    const box = game.player.hitbox();

    expect(new Wave(game.player.y - 4, game.player.x, 60, 0).hits(box)).toBe(false);
    expect(new Wave(game.player.y - 4, game.player.x + 95, 40, 0).hits(box)).toBe(
      true
    );
  });

  test("a coconut raises the score", () => {
    const game = atSea(newGame());
    const before = game.score;
    game.pickups.push(new Pickup("coconut", game.player.x, game.player.y, 0));
    game.update(FRAME);

    expect(game.score).toBeGreaterThan(before + 50);
  });

  test("a star is worth more than a coconut", () => {
    const scored = (kind: "coconut" | "star"): number => {
      const game = atSea(newGame());
      const before = game.score;
      game.pickups.push(new Pickup(kind, game.player.x, game.player.y, 0));
      game.update(FRAME);

      return game.score - before;
    };

    expect(scored("star")).toBeGreaterThan(scored("coconut"));
  });

  test("a turtle grants a life, up to five", () => {
    const game = atSea(newGame());
    game.lives = 2;
    game.pickups.push(new Pickup("turtle", game.player.x, game.player.y, 0));
    game.update(FRAME);

    expect(game.lives).toBe(3);

    const capped = atSea(newGame());
    capped.lives = 5;
    capped.pickups.push(
      new Pickup("turtle", capped.player.x, capped.player.y, 0)
    );
    capped.update(FRAME);

    expect(capped.lives).toBe(5);
  });

  test("the player stays inside the screen", () => {
    const game = atSea(newGame());
    game.input.left = true;
    step(game, 300);

    expect(game.player.x).toBeGreaterThanOrEqual(0);

    game.input.left = false;
    game.input.right = true;
    step(game, 300);

    expect(game.player.x).toBeLessThanOrEqual(200);
  });

  test("zero lives ends the run", () => {
    const game = atSea(newGame());

    for (let i = 0; i < 4; i++) {
      game.player.invuln = 0;
      game.hitPlayer("shark");
    }

    expect(game.state).toBe(STATE.GAMEOVER);
    expect(game.lives).toBeLessThanOrEqual(0);
  });

  test("reaching 75 km wins, and the distance never passes it", () => {
    const game = atSea(newGame(), 74.9);

    for (let i = 0; i < 600 && game.state === STATE.PLAY; i++) {
      game.update(FRAME);
    }

    expect(game.state).toBe(STATE.VICTORY);

    const past = atSea(newGame(), 74.99);
    step(past, 600);

    expect(past.km()).toBeLessThanOrEqual(TOTAL_KM + 0.0001);
  });
});

describe("menu flow", () => {
  test("splash advances to the menu", () => {
    const game = newGame();
    game.setState(STATE.SPLASH);
    game.press("confirm");

    expect(game.state).toBe(STATE.MENU);
  });

  test("the cursor moves and wraps", () => {
    const game = newGame();
    game.setState(STATE.MENU);
    game.menuIndex = 0;
    game.press("down");

    expect(game.menuIndex).toBe(1);

    game.press("up");
    game.press("up");

    expect(game.menuIndex).toBe(game.menuItems.length - 1);
  });

  test("NEW GAME starts the intro on a fresh run", () => {
    const game = newGame();
    selectMenu(game, "NEW GAME");
    game.press("confirm");

    expect(game.state).toBe(STATE.INTRO);
    expect(game.lives).toBe(3);
    expect(Math.floor(game.score)).toBe(0);
  });

  test("SCORES and HOW TO PLAY open and return", () => {
    const game = newGame();
    selectMenu(game, "SCORES");
    game.press("confirm");

    expect(game.state).toBe(STATE.SCORES);

    game.press("confirm");

    expect(game.state).toBe(STATE.MENU);

    selectMenu(game, "HOW TO PLAY");
    game.press("confirm");

    expect(game.state).toBe(STATE.HOWTO);

    game.press("back");

    expect(game.state).toBe(STATE.MENU);
  });
});

describe("speed setting", () => {
  test("cycles through every level and wraps", () => {
    const game = newGame();
    selectMenu(game, "SPEED");
    const start = game.speedName();
    const seen = new Set<string>();

    for (let i = 0; i < SPEEDS.length * 2; i++) {
      seen.add(game.speedName());
      game.press("right");
    }

    expect(seen.size).toBe(SPEEDS.length);
    expect(game.speedName()).toBe(start);
  });

  test("left and right step it, confirm advances it", () => {
    const game = newGame();
    selectMenu(game, "SPEED");
    const first = game.speedName();
    game.press("right");
    const second = game.speedName();

    expect(second).not.toBe(first);

    game.press("left");

    expect(game.speedName()).toBe(first);

    game.press("confirm");

    expect(game.speedName()).toBe(second);
    expect(game.state).toBe(STATE.MENU);
  });

  test("persists across a new Game", () => {
    const game = newGame();
    selectMenu(game, "SPEED");
    game.press("right");
    game.press("right");

    expect(newGame().speedName()).toBe(game.speedName());
  });

  test("a faster sea covers more ground", () => {
    const covered = (index: number): number => {
      const game = newGame();
      game.speedIndex = index;
      game.setState(STATE.PLAY);
      step(game, 120);

      return game.km();
    };

    expect(covered(SPEEDS.length - 1)).toBeGreaterThan(covered(0) * 1.4);
  });
});

describe("intro cutscene", () => {
  test("plays, takes the slide, then hands over to the run", () => {
    const game = newGame();
    game.startIntro();
    const startY = game.intro?.slideY ?? 0;

    for (let i = 0; i < 60 * 20 && game.state === STATE.INTRO; i++) {
      game.update(FRAME);
    }

    expect(game.state).toBe(STATE.PLAY);
    expect(game.intro?.grabbed).toBe(true);
    expect(game.intro?.slideY).toBeLessThan(startY - 40);
  });

  test("is skippable with enter", () => {
    const game = newGame();
    game.startIntro();
    game.update(FRAME);
    game.press("confirm");

    expect(game.state).toBe(STATE.PLAY);
  });

  test("the run starts near where the sea left the slide", () => {
    const game = newGame();
    game.startIntro();

    for (let i = 0; i < 60 * 20 && game.state === STATE.INTRO; i++) {
      game.update(FRAME);
    }

    expect(game.player.y).toBeGreaterThan(180);
    expect(game.player.y).toBeLessThan(320);
  });
});

describe("name entry", () => {
  test("edits, types and submits the initials", () => {
    const game = newGame();
    game.setState(STATE.ENTRY);
    game.entryName = ["A", "A", "A"];
    game.entryIndex = 0;

    game.press("up");

    expect(game.entryName[0]).toBe("B");

    game.press("right");

    expect(game.entryIndex).toBe(1);

    game.typeChar("x");

    expect(game.entryName[1]).toBe("X");

    game.entryIndex = 2;
    game.pendingScore = 7777;
    game.pendingKm = 60;
    game.press("confirm");

    expect(game.state).toBe(STATE.SCORES);
    expect(game.scores.load().some((entry) => entry.score === 7777)).toBe(true);
  });
});

describe("soak", () => {
  test("four minutes of unattended play stay stable", () => {
    const game = atSea(newGame(), 0);
    let maxEntities = 0;

    for (let i = 0; i < 60 * 60 * 4; i++) {
      if (i % 37 === 0) {
        game.input.left = !game.input.left;
      }

      if (i % 53 === 0) {
        game.input.right = !game.input.right;
        game.input.up = !game.input.up;
      }

      if (i % 71 === 0) {
        game.input.down = !game.input.down;
      }

      game.update(FRAME);
      Object.defineProperty(game, "ctx", {
        value: recordingContext(),
        writable: true,
      });
      game.draw();

      maxEntities = Math.max(
        maxEntities,
        game.hazards.length + game.pickups.length + game.particles.length
      );

      if (game.state !== STATE.PLAY) {
        break;
      }
    }

    expect(Number.isFinite(game.score)).toBe(true);
    expect(Number.isFinite(game.player.x)).toBe(true);
    expect(Number.isFinite(game.player.y)).toBe(true);
    expect(maxEntities).toBeLessThan(400);
  });
});
