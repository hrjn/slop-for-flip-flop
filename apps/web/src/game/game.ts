/**
 * slop for flip flop — state machine and rendering.
 *
 * Lore: a black Mistral claquette lost on Koh Samui drifted 75 km across the Gulf of Thailand and
 * washed up on Koh Tao. This is that crossing.
 */

import { Sound } from "./audio";
import { drawText, textWidth } from "./font";
import {
  FloatText,
  FlipFlop,
  Particle,
  Pickup,
  Shark,
  Surfer,
  Wave,
  rectsOverlap,
} from "./entities";
import type { Box, Hazard, Input, PickupKind } from "./entities";
import { ScoreBoard } from "./scores";
import { drawSprite, drawSpriteCentered } from "./sprites";
import {
  H,
  W,
  drawGoalIsland,
  drawMenuBackdrop,
  drawOcean,
  drawStartIsland,
  hash,
} from "./world";

export const STATE = {
  SPLASH: "splash",
  MENU: "menu",
  SCORES: "scores",
  HOWTO: "howto",
  INTRO: "intro",
  PLAY: "play",
  GAMEOVER: "gameover",
  VICTORY: "victory",
  ENTRY: "entry",
} as const;

export type GameState = (typeof STATE)[keyof typeof STATE];

/** Koh Samui -> Koh Tao. */
export const TOTAL_KM = 75;

const METERS_PER_PX = 0.9; // tuned so a clean run lasts ~3 minutes
const START_LIVES = 3;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ";
const SPEED_KEY = "slop-for-flip-flop.speed.v1";

export interface SpeedLevel {
  readonly name: string;
  /** How fast the sea carries you: sets both run length and reaction time. */
  readonly flow: number;
  /** Spawn frequency multiplier, already scaled by flow. */
  readonly rate: number;
  /** The intended hazards-per-km multiplier. */
  readonly density: number;
}

/**
 * A slower flow also means a longer crossing, so `rate` is scaled by flow too. Without that every
 * level ends up with the same number of hazards per kilometre and only the clock changes.
 */
const speedLevel = (name: string, flow: number, density: number): SpeedLevel => ({
  name,
  flow,
  rate: density * flow,
  density,
});

export const SPEEDS: readonly SpeedLevel[] = [
  speedLevel("CALM", 0.78, 0.82),
  speedLevel("DRIFT", 1.0, 1.0),
  speedLevel("SWELL", 1.26, 1.14),
  speedLevel("STORM", 1.55, 1.28),
];

const loadSpeed = (): number => {
  try {
    const stored = Number.parseInt(
      window.localStorage.getItem(SPEED_KEY) ?? "",
      10
    );

    if (stored >= 0 && stored < SPEEDS.length) {
      return stored;
    }
  } catch {
    // Storage unavailable; fall through to the default.
  }

  return 1;
};

const saveSpeed = (index: number): void => {
  try {
    window.localStorage.setItem(SPEED_KEY, String(index));
  } catch {
    // Not worth failing over.
  }
};

export type PressKey = "left" | "right" | "up" | "down" | "confirm" | "back" | "any";

interface Intro {
  beachY: number;
  /** The hero's resting spot on the sand. */
  pairX: number;
  /** The twin left behind. */
  sisterX: number;
  slideX: number;
  slideY: number;
  slideRot: number;
  /** 0..1, how far the water has run up the sand. */
  swash: number;
  grabbed: boolean;
  done: boolean;
}

const MENU_ITEMS = ["NEW GAME", "SPEED", "SCORES", "HOW TO PLAY"] as const;

/** The menu row a pointer at canvas `y` lands on; -1 when it is outside the list. */
export const MENU_ROW_TOP = 116;
export const MENU_ROW_HEIGHT = 20;

export class Game {
  readonly ctx: CanvasRenderingContext2D;
  readonly scores: ScoreBoard;
  readonly menuItems = MENU_ITEMS;

  state: GameState = STATE.SPLASH;
  t = 0;
  stateT = 0;
  menuIndex = 0;
  speedIndex: number;

  input: Input = {
    left: false,
    right: false,
    up: false,
    down: false,
    pointer: false,
    pointerX: 0,
    pointerY: 0,
  };

  entryName: string[] = ["A", "A", "A"];
  entryIndex = 0;
  pendingScore = 0;
  pendingKm = 0;

  player!: FlipFlop;
  hazards: Hazard[] = [];
  pickups: Pickup[] = [];
  particles: Particle[] = [];
  floats: FloatText[] = [];
  score = 0;
  lives = START_LIVES;
  distancePx = 0;
  scroll = 0;
  scrollSpeed = 46;
  combo = 0;
  comboTimer = 0;
  spawnTimers = { surfer: 1.6, shark: 3.4, wave: 5.0, pickup: 2.2 };
  shake = 0;
  flash = 0;
  finished = false;
  won = false;
  startIslandY = H - 150;
  introSisterX: number | undefined;
  intro: Intro | undefined;

  constructor(canvas: HTMLCanvasElement, scores: ScoreBoard = new ScoreBoard()) {
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("canvas 2d context is unavailable");
    }

    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.scores = scores;
    this.speedIndex = loadSpeed();
    this.reset();
  }

  reset(): void {
    this.player = new FlipFlop();
    this.hazards = [];
    this.pickups = [];
    this.particles = [];
    this.floats = [];
    this.score = 0;
    this.lives = START_LIVES;
    this.distancePx = 0;
    this.scroll = 0;
    this.scrollSpeed = 46;
    this.combo = 0;
    this.comboTimer = 0;
    this.spawnTimers = { surfer: 1.6, shark: 3.4, wave: 5.0, pickup: 2.2 };
    this.shake = 0;
    this.flash = 0;
    this.finished = false;
    this.won = false;
    this.startIslandY = H - 150;
    this.intro = undefined;
    this.introSisterX = undefined;
  }

  setState(state: GameState): void {
    this.state = state;
    this.stateT = 0;
  }

  speed(): SpeedLevel {
    return SPEEDS[this.speedIndex] ?? (SPEEDS[1] as SpeedLevel);
  }

  speedName(): string {
    return this.speed().name;
  }

  cycleSpeed(direction: number): number {
    this.speedIndex =
      (this.speedIndex + direction + SPEEDS.length) % SPEEDS.length;
    saveSpeed(this.speedIndex);

    return this.speedIndex;
  }

  km(): number {
    return Math.min(
      TOTAL_KM,
      ((this.distancePx * METERS_PER_PX) / 1000) * 11.5
    );
  }

  progress(): number {
    return Math.min(1, this.km() / TOTAL_KM);
  }

  /* ------------------------------------------------------------- intro */

  /**
   * The cutscene: two slides sit on the sand, a swash runs up the beach, takes the left one and
   * carries it out to sea. Then play begins.
   */
  startIntro(): void {
    this.reset();
    this.setState(STATE.INTRO);
    this.intro = {
      beachY: 150,
      pairX: 86,
      sisterX: 116,
      slideX: 86,
      slideY: 214,
      slideRot: 0,
      swash: 0,
      grabbed: false,
      done: false,
    };
    Sound.surf();
    Sound.music("game");
  }

  private updateIntro(dt: number): void {
    const intro = this.intro;

    if (!intro) {
      this.setState(STATE.PLAY);

      return;
    }

    const t = this.stateT;

    // Two swash cycles: the first washes close, the second takes the slide.
    const cycle = t < 2.0 ? t / 2.0 : (t - 2.0) / 2.6;
    const reach = t < 2.0 ? 0.45 : 1.0;
    intro.swash = Math.max(0, Math.sin(Math.min(1, cycle) * Math.PI)) * reach;

    if (t >= 2.9 && !intro.grabbed) {
      intro.grabbed = true;
      Sound.splash();
      this.burst(intro.slideX, intro.slideY, "#ffffff", 22, 70);
    }

    if (intro.grabbed) {
      // Dragged seaward: up the screen, wobbling, pulling away from its twin.
      const g = Math.min(1, (t - 2.9) / 2.3);
      const ease = g * g * (3 - 2 * g);
      intro.slideY = 214 - ease * 96;
      intro.slideX = 86 - Math.sin(t * 3.4) * 7 * (1 - ease * 0.4);
      intro.slideRot = Math.sin(t * 2.6) * 0.5 * (1 - ease * 0.3);

      if (Math.random() < 0.6) {
        this.particles.push(
          new Particle(
            intro.slideX + (Math.random() * 10 - 5),
            intro.slideY + 8,
            (Math.random() - 0.5) * 16,
            24 + Math.random() * 22,
            0.5,
            "#bff0ff",
            1
          )
        );
      }

      if (g >= 1 && !intro.done) {
        intro.done = true;
        this.beginRun();

        return;
      }
    }

    this.updateFx(dt);
  }

  /** Hand control over, keeping the hero where the sea left it. */
  beginRun(): void {
    const intro = this.intro;
    this.setState(STATE.PLAY);
    this.player.x = intro ? intro.slideX : W / 2;
    this.player.y = H - 90;
    this.player.invuln = 1.2;
    this.startIslandY = H - 10;
    this.introSisterX = intro ? intro.sisterX : 116;
    Sound.music("game");
  }

  /* ------------------------------------------------------------- input */

  press(key: PressKey): void {
    switch (this.state) {
      case STATE.SPLASH:
        if (key === "confirm" || key === "any") {
          Sound.confirm();
          this.setState(STATE.MENU);
        }

        return;

      case STATE.MENU:
        this.pressMenu(key);

        return;

      case STATE.SCORES:
      case STATE.HOWTO:
        if (key === "confirm" || key === "back" || key === "any") {
          Sound.select();
          this.setState(STATE.MENU);
        }

        return;

      case STATE.INTRO:
        if (key === "back") {
          Sound.select();
          this.setState(STATE.MENU);
          Sound.music("menu");
        } else if (key === "confirm" || key === "any") {
          this.beginRun(); // let impatient players skip the cutscene
        }

        return;

      case STATE.PLAY:
        if (key === "back") {
          Sound.select();
          this.setState(STATE.MENU);
          Sound.music("menu");
        }

        return;

      case STATE.GAMEOVER:
      case STATE.VICTORY:
        this.pressEndScreen(key);

        return;

      case STATE.ENTRY:
        this.pressEntry(key);
    }
  }

  private pressMenu(key: PressKey): void {
    const item = this.menuItems[this.menuIndex];

    if (key === "up") {
      this.menuIndex =
        (this.menuIndex + this.menuItems.length - 1) % this.menuItems.length;
      Sound.select();
    } else if (key === "down") {
      this.menuIndex = (this.menuIndex + 1) % this.menuItems.length;
      Sound.select();
    } else if (key === "left" && item === "SPEED") {
      this.cycleSpeed(-1);
      Sound.select();
    } else if (key === "right" && item === "SPEED") {
      this.cycleSpeed(1);
      Sound.select();
    } else if (key === "confirm") {
      if (item === "NEW GAME") {
        Sound.confirm();
        this.startIntro();
      } else if (item === "SPEED") {
        this.cycleSpeed(1);
        Sound.select();
      } else if (item === "SCORES") {
        Sound.confirm();
        this.setState(STATE.SCORES);
      } else {
        Sound.confirm();
        this.setState(STATE.HOWTO);
      }
    }
  }

  private pressEndScreen(key: PressKey): void {
    // A short lockout so the keypress that killed you does not skip the screen.
    if (this.stateT < 0.8) {
      return;
    }

    if (key !== "confirm" && key !== "any") {
      return;
    }

    if (this.scores.qualifies(this.score)) {
      this.pendingScore = Math.floor(this.score);
      this.pendingKm = Math.round(this.km());
      this.entryName = ["A", "A", "A"];
      this.entryIndex = 0;
      this.setState(STATE.ENTRY);
      Sound.confirm();
    } else {
      this.setState(STATE.MENU);
      Sound.music("menu");
    }
  }

  private pressEntry(key: PressKey): void {
    const current = ALPHABET.indexOf(this.entryName[this.entryIndex] ?? "A");

    if (key === "up") {
      this.entryName[this.entryIndex] = ALPHABET[
        (current + 1) % ALPHABET.length
      ] as string;
      Sound.select();
    } else if (key === "down") {
      this.entryName[this.entryIndex] = ALPHABET[
        (current + ALPHABET.length - 1) % ALPHABET.length
      ] as string;
      Sound.select();
    } else if (key === "left") {
      this.entryIndex = Math.max(0, this.entryIndex - 1);
      Sound.select();
    } else if (key === "right") {
      this.entryIndex = Math.min(2, this.entryIndex + 1);
      Sound.select();
    } else if (key === "confirm") {
      if (this.entryIndex < 2) {
        this.entryIndex++;
        Sound.select();
      } else {
        this.scores.submit(
          this.entryName.join("").trim() || "AAA",
          this.pendingScore,
          this.pendingKm
        );
        Sound.confirm();
        this.setState(STATE.SCORES);
      }
    }
  }

  typeChar(char: string): void {
    if (this.state !== STATE.ENTRY) {
      return;
    }

    const upper = char.toUpperCase();

    if (!ALPHABET.includes(upper)) {
      return;
    }

    this.entryName[this.entryIndex] = upper;

    if (this.entryIndex < 2) {
      this.entryIndex++;
    }

    Sound.select();
  }

  /* ---------------------------------------------------------- spawning */

  difficulty(): number {
    return Math.min(1, this.progress() * 1.25);
  }

  /**
   * A wave forces the player into one narrow lane, so nothing else may spawn while one is sweeping
   * down: the gap has to stay reachable.
   */
  waveIncoming(): boolean {
    return this.hazards.some(
      (hazard) => hazard.type === "wave" && hazard.y < this.player.y + 10
    );
  }

  /** True while hazards still occupy the upper approach lane. */
  topBandBusy(): boolean {
    return this.hazards.some((hazard) => hazard.y < 150);
  }

  private spawn(dt: number): void {
    const d = this.difficulty();
    const p = this.progress();
    const timers = this.spawnTimers;

    timers.surfer -= dt;
    timers.shark -= dt;
    timers.wave -= dt;
    timers.pickup -= dt;

    const waveBusy = this.waveIncoming();
    // Higher speed settings shorten the gaps between hazards.
    const gap = 1 / this.speed().rate;

    if (timers.surfer <= 0 && !waveBusy) {
      timers.surfer = (2.9 - d * 1.1 + Math.random() * 1.5) * gap;
      this.hazards.push(
        new Surfer(
          16 + Math.random() * (W - 32),
          -24,
          18 + Math.random() * 24 + d * 20,
          14 + Math.random() * 24
        )
      );
    }

    // Sharks only show up once you are out of the shallows.
    if (timers.shark <= 0 && p > 0.12 && !waveBusy) {
      timers.shark = (5.0 - d * 1.9 + Math.random() * 2.4) * gap;
      this.hazards.push(
        new Shark(
          16 + Math.random() * (W - 32),
          -30,
          20 + Math.random() * 18 + d * 24
        )
      );
    }

    // Waves wait for a clear deck, then sweep alone.
    if (timers.wave <= 0 && p > 0.05) {
      if (this.topBandBusy() || waveBusy) {
        timers.wave = 0.4;
      } else {
        timers.wave = (7.6 - d * 2.2 + Math.random() * 2.4) * gap;
        const gapW = 78 - d * 26;
        const gapX = gapW / 2 + 6 + Math.random() * (W - gapW - 12);
        this.hazards.push(new Wave(-16, gapX, gapW, 8 + d * 12));
      }
    }

    if (timers.pickup <= 0) {
      timers.pickup = 2.0 + Math.random() * 2.2;
      const roll = Math.random();
      const kind: PickupKind =
        roll > 0.9 ? "turtle" : roll > 0.72 ? "star" : "coconut";
      this.pickups.push(
        new Pickup(kind, 14 + Math.random() * (W - 28), -14, 10 + Math.random() * 14)
      );
    }
  }

  /* ----------------------------------------------------------- effects */

  burst(x: number, y: number, color: string, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.4 + Math.random() * 0.8);
      this.particles.push(
        new Particle(
          x,
          y,
          Math.cos(angle) * velocity,
          Math.sin(angle) * velocity,
          0.3 + Math.random() * 0.5,
          color,
          Math.random() > 0.7 ? 2 : 1
        )
      );
    }
  }

  hitPlayer(what: string): void {
    if (this.player.invuln > 0) {
      return;
    }

    this.lives--;
    this.player.invuln = 2.0;
    this.combo = 0;
    this.shake = 7;
    this.flash = 0.35;
    Sound.hit();
    this.burst(this.player.x, this.player.y, "#ffffff", 22, 110);
    this.burst(this.player.x, this.player.y, "#bff0ff", 14, 80);

    const label =
      what === "shark" ? "CHOMP!" : what === "wave" ? "WIPEOUT!" : "OUCH!";
    this.floats.push(
      new FloatText(this.player.x, this.player.y - 16, label, "#ff7a5c")
    );
    this.player.vy += 40;

    if (this.lives <= 0) {
      this.finished = true;
      this.won = false;
      this.setState(STATE.GAMEOVER);
      Sound.stopMusic();
      Sound.gameover();
    }
  }

  /* ------------------------------------------------------------ update */

  update(dt: number): void {
    this.t += dt;
    this.stateT += dt;

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 22);
    }

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
    }

    if (this.state === STATE.SPLASH) {
      if (this.stateT > 14) {
        this.setState(STATE.MENU);
      }

      return;
    }

    if (this.state === STATE.INTRO) {
      this.updateIntro(dt);

      return;
    }

    if (this.state !== STATE.PLAY) {
      this.updateFx(dt);

      return;
    }

    const p = this.progress();
    this.scrollSpeed = (46 + p * 44) * this.speed().flow;
    this.distancePx += this.scrollSpeed * dt;
    this.scroll += this.scrollSpeed * dt;
    this.startIslandY += this.scrollSpeed * dt;

    this.player.update(dt, this.input);

    // Distance score ticks up continuously; faster seas pay more.
    this.score += this.scrollSpeed * dt * 0.55;

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;

      if (this.comboTimer <= 0) {
        this.combo = 0;
      }
    }

    this.spawn(dt);

    const box = this.player.hitbox();

    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hazard = this.hazards[i] as Hazard;
      hazard.update(dt, this);

      if (hazard.dead) {
        this.hazards.splice(i, 1);
        continue;
      }

      if (this.collides(hazard, box)) {
        this.hitPlayer(hazard.type);
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i] as Pickup;
      pickup.update(dt, this);

      if (pickup.dead) {
        this.pickups.splice(i, 1);
        continue;
      }

      if (rectsOverlap(box, pickup.hitbox())) {
        this.pickups.splice(i, 1);
        this.collect(pickup);
      }
    }

    this.updateFx(dt);

    // Wake trail.
    if (Math.random() < 0.5) {
      this.particles.push(
        new Particle(
          this.player.x + (Math.random() * 8 - 4),
          this.player.y + 10,
          (Math.random() - 0.5) * 12,
          30 + Math.random() * 20,
          0.4,
          "#bff0ff",
          1
        )
      );
    }

    if (this.progress() >= 1 && !this.finished) {
      this.finished = true;
      this.won = true;
      this.score += 2500 + this.lives * 750;
      this.setState(STATE.VICTORY);
      Sound.stopMusic();
      Sound.victory();
      this.burst(this.player.x, this.player.y, "#ffe66d", 40, 120);
    }
  }

  private collides(hazard: Hazard, box: Box): boolean {
    if (hazard.hits) {
      return hazard.hits(box);
    }

    return hazard.hitbox ? rectsOverlap(box, hazard.hitbox()) : false;
  }

  private updateFx(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i] as Particle;
      particle.update(dt);

      if (particle.dead) {
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.floats.length - 1; i >= 0; i--) {
      const float = this.floats[i] as FloatText;
      float.update(dt);

      if (float.dead) {
        this.floats.splice(i, 1);
      }
    }
  }

  private collect(pickup: Pickup): void {
    this.combo = Math.min(9, this.combo + 1);
    this.comboTimer = 3.2;
    const multiplier = 1 + (this.combo - 1) * 0.5;
    let gained: number;

    if (pickup.kind === "star") {
      gained = Math.round(250 * multiplier);
      this.player.boost = 1.4;
      Sound.star();
      this.burst(pickup.x, pickup.y, "#ffe66d", 16, 90);
    } else if (pickup.kind === "turtle") {
      gained = Math.round(120 * multiplier);

      if (this.lives < 5) {
        this.lives++;
        this.floats.push(
          new FloatText(pickup.x, pickup.y - 12, "+1 LIFE", "#7cf0a8")
        );
      }

      Sound.star();
      this.burst(pickup.x, pickup.y, "#63d183", 14, 80);
    } else {
      gained = Math.round(60 * multiplier);
      Sound.pickup();
      this.burst(pickup.x, pickup.y, "#e0c489", 10, 70);
    }

    this.score += gained;
    this.floats.push(
      new FloatText(
        pickup.x,
        pickup.y,
        `+${gained}${this.combo > 1 ? ` X${this.combo}` : ""}`,
        pickup.kind === "star" ? "#ffe66d" : "#ffd98a"
      )
    );
  }

  /* -------------------------------------------------------------- draw */

  draw(): void {
    const ctx = this.ctx;
    ctx.save();

    if (this.shake > 0) {
      ctx.translate(
        Math.round((Math.random() - 0.5) * this.shake),
        Math.round((Math.random() - 0.5) * this.shake)
      );
    }

    switch (this.state) {
      case STATE.SPLASH:
        this.drawSplash(ctx);
        break;
      case STATE.MENU:
        this.drawMenu(ctx);
        break;
      case STATE.SCORES:
        this.drawScores(ctx);
        break;
      case STATE.HOWTO:
        this.drawHowTo(ctx);
        break;
      case STATE.ENTRY:
        this.drawEntry(ctx);
        break;
      case STATE.INTRO:
        this.drawIntro(ctx);
        break;
      case STATE.PLAY:
      case STATE.GAMEOVER:
      case STATE.VICTORY:
        this.drawWorld(ctx);

        if (this.state === STATE.GAMEOVER) {
          this.drawGameOver(ctx);
        }

        if (this.state === STATE.VICTORY) {
          this.drawVictory(ctx);
        }

        break;
    }

    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,90,90,${(this.flash * 0.5).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }

    this.drawVignette(ctx);
  }

  private drawVignette(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(0, 0, W, 1);
    ctx.fillRect(0, H - 1, W, 1);
    ctx.fillRect(0, 0, 1, H);
    ctx.fillRect(W - 1, 0, 1, H);
  }

  /** A dark plate behind text, so the busy sea pattern never competes with glyphs. */
  private plate(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    alpha = 0.72
  ): void {
    ctx.fillStyle = `rgba(6,18,32,${alpha})`;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  private drawPanel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    title?: string
  ): void {
    ctx.fillStyle = "rgba(8,24,40,0.86)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#ff9f1c";
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x + w - 1, y, 1, h);

    if (title !== undefined) {
      ctx.fillStyle = "#ff9f1c";
      ctx.fillRect(x, y, w, 12);
      drawText(ctx, title, x + w / 2, y + 3, {
        color: "#2b1a10",
        scale: 1,
        align: "center",
      });
    }
  }

  private drawTitleArt(
    ctx: CanvasRenderingContext2D,
    yBase: number,
    showSlide = true
  ): void {
    const bob = Math.sin(this.t * 1.6) * 2;

    this.plate(ctx, 6, yBase - 8, W - 12, 78, 0.78);
    ctx.fillStyle = "#ff9f1c";
    ctx.fillRect(6, yBase - 8, W - 12, 1);
    ctx.fillRect(6, yBase + 69, W - 12, 1);
    ctx.fillStyle = "rgba(255,159,28,0.35)";
    ctx.fillRect(6, yBase - 7, W - 12, 1);

    drawText(ctx, "SLOP", 100, yBase, {
      color: "#2b1a10",
      scale: 4,
      align: "center",
      tracking: 1,
    });
    drawText(ctx, "SLOP", 100, yBase - 2, {
      color: "#ffd98a",
      scale: 4,
      align: "center",
      tracking: 1,
    });

    drawText(ctx, "FOR", 100, yBase + 32, {
      color: "#2b1a10",
      scale: 2,
      align: "center",
    });
    drawText(ctx, "FOR", 100, yBase + 30, {
      color: "#ff9f1c",
      scale: 2,
      align: "center",
    });

    drawText(ctx, "FLIP FLOP", 100, yBase + 50, {
      color: "#2b1a10",
      scale: 3,
      align: "center",
      tracking: 1,
    });
    drawText(ctx, "FLIP FLOP", 100, yBase + 48, {
      color: "#ffffff",
      scale: 3,
      align: "center",
      tracking: 1,
    });

    if (showSlide) {
      drawSpriteCentered(ctx, "flipflop", 100, yBase + 92 + bob, { scale: 2 });
      ctx.fillStyle = "rgba(191,240,255,0.5)";
      ctx.fillRect(84, yBase + 118 + bob, 32, 1);
      ctx.fillRect(90, yBase + 121 + bob, 20, 1);
    }
  }

  private drawSplash(ctx: CanvasRenderingContext2D): void {
    drawMenuBackdrop(ctx, this.t);
    this.drawTitleArt(ctx, 26);

    this.plate(ctx, 10, 186, W - 20, 26, 0.74);
    drawText(ctx, "THE 75 KM CROSSING", 100, 190, {
      color: "#ffd98a",
      scale: 1,
      align: "center",
    });
    drawText(ctx, "KOH SAMUI  TO  KOH TAO", 100, 202, {
      color: "#bff0ff",
      scale: 1,
      align: "center",
    });

    this.plate(ctx, 28, 234, W - 56, 20, 0.74);

    if (Math.floor(this.t * 1.6) % 2 === 0) {
      drawText(ctx, "PRESS ENTER", 100, 239, {
        color: "#ffffff",
        scale: 2,
        align: "center",
      });
    }

    this.plate(ctx, 10, 292, W - 20, 13, 0.74);
    drawText(ctx, "BASED ON A TRUE SLACK THREAD", 100, 295, {
      color: "#ffb35c",
      scale: 1,
      align: "center",
    });
  }

  private drawMenu(ctx: CanvasRenderingContext2D): void {
    drawMenuBackdrop(ctx, this.t);
    this.drawTitleArt(ctx, 16, false);

    // A single drifting slide beside the title rather than under it, so the menu block below has
    // room to breathe.
    drawSpriteCentered(ctx, "flipflop", 176, 30 + Math.sin(this.t * 1.6) * 2);

    const top = MENU_ROW_TOP;
    const rowH = MENU_ROW_HEIGHT;

    // One continuous plate behind the whole menu block keeps every row legible.
    this.plate(ctx, 14, top - 7, W - 28, this.menuItems.length * rowH + 8, 0.8);
    ctx.fillStyle = "#ff9f1c";
    ctx.fillRect(14, top - 7, W - 28, 1);
    ctx.fillRect(14, top + this.menuItems.length * rowH, W - 28, 1);

    for (let i = 0; i < this.menuItems.length; i++) {
      const selected = i === this.menuIndex;
      const y = top + i * rowH;
      const item = this.menuItems[i] as string;
      const label = item === "SPEED" ? `SPEED  ${this.speedName()}` : item;

      if (selected) {
        ctx.fillStyle = "rgba(255,159,28,0.22)";
        ctx.fillRect(16, y - 4, W - 32, rowH - 2);
        ctx.fillStyle = "#ff9f1c";
        ctx.fillRect(16, y - 4, 2, rowH - 2);
        drawSpriteCentered(
          ctx,
          "flipflopIcon",
          28,
          y + 5 + Math.sin(this.t * 6) * 1
        );
      }

      drawText(ctx, label, 110, y, {
        color: selected ? "#ffffff" : "#ffd98a",
        scale: 1,
        align: "center",
      });

      // Show that SPEED is adjustable sideways.
      if (selected && item === "SPEED") {
        const half = textWidth(label, 1, 1) / 2;
        drawText(ctx, "<", 110 - half - 10, y, { color: "#ffe66d", scale: 1 });
        drawText(ctx, ">", 110 + half + 5, y, { color: "#ffe66d", scale: 1 });
      }
    }

    const footY = top + this.menuItems.length * rowH + 8;
    this.plate(ctx, 10, footY, W - 20, 40, 0.74);
    const best = this.scores.load()[0];

    if (best) {
      drawText(ctx, `BEST  ${best.name}  ${best.score}`, 100, footY + 4, {
        color: "#bff0ff",
        scale: 1,
        align: "center",
      });
    }

    drawText(ctx, "ARROWS + ENTER", 100, footY + 16, {
      color: "#ffb35c",
      scale: 1,
      align: "center",
    });
    drawText(
      ctx,
      Sound.isMuted() ? "SOUND OFF  (M)" : "SOUND ON  (M)",
      100,
      footY + 28,
      {
        color: Sound.isMuted() ? "#ff7a5c" : "#ffb35c",
        scale: 1,
        align: "center",
      }
    );
  }

  private drawScores(ctx: CanvasRenderingContext2D): void {
    drawMenuBackdrop(ctx, this.t);
    drawText(ctx, "SCORES", 100, 18, {
      color: "#ffffff",
      scale: 3,
      align: "center",
      shadow: 2,
      shadowColor: "#2b1a10",
    });

    const list = this.scores.load();
    this.drawPanel(ctx, 14, 52, W - 28, 200, "RANK  NAME   KM    SCORE");

    for (let i = 0; i < list.length; i++) {
      const entry = list[i];

      if (!entry) {
        continue;
      }

      const y = 72 + i * 22;
      const color = i === 0 ? "#ffe66d" : i < 3 ? "#ffd98a" : "#bff0ff";

      if (i % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(16, y - 4, W - 32, 19);
      }

      drawText(ctx, i + 1, 26, y, { color, scale: 1 });
      drawText(ctx, entry.name, 52, y, { color, scale: 2 });
      drawText(ctx, `${entry.km}KM`, 118, y, {
        color: "#bff0ff",
        scale: 1,
        align: "right",
      });
      drawText(ctx, entry.score, W - 24, y, { color, scale: 1, align: "right" });

      if (i === 0) {
        drawSpriteCentered(
          ctx,
          "flipflopIcon",
          W - 14,
          y + 5 + Math.sin(this.t * 4) * 1
        );
      }
    }

    drawText(ctx, "FULL CROSSING IS 75 KM", 100, 266, {
      color: "#ffb35c",
      scale: 1,
      align: "center",
      shadow: 1,
    });

    if (Math.floor(this.t * 2) % 2 === 0) {
      drawText(ctx, "ENTER TO GO BACK", 100, 288, {
        color: "#ffffff",
        scale: 1,
        align: "center",
        shadow: 1,
      });
    }
  }

  private drawHowTo(ctx: CanvasRenderingContext2D): void {
    drawMenuBackdrop(ctx, this.t);
    drawText(ctx, "HOW TO", 100, 16, {
      color: "#ffffff",
      scale: 3,
      align: "center",
      shadow: 2,
      shadowColor: "#2b1a10",
    });

    this.drawPanel(ctx, 12, 54, W - 24, 206, "DRIFT NORTH, STAY WHOLE");

    const rows = [
      ["surfer", "SURFERS BUMP YOU"],
      ["shark", "SHARKS CHASE YOU"],
      [null, "WAVES: USE THE GAP"],
      ["coconut", "COCONUT  +60"],
      ["star", "STAR  +250"],
      ["turtle", "TURTLE  +1 LIFE"],
    ] as const;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (!row) {
        continue;
      }

      const [sprite, label] = row;
      const y = 78 + i * 29;

      if (sprite) {
        drawSpriteCentered(ctx, sprite, 34, y + 6);
      } else {
        ctx.fillStyle = "#2f97cf";
        ctx.fillRect(22, y + 4, 10, 5);
        ctx.fillRect(38, y + 4, 10, 5);
        ctx.fillStyle = "#bff0ff";
        ctx.fillRect(22, y + 2, 10, 2);
        ctx.fillRect(38, y + 2, 10, 2);
      }

      drawText(ctx, label, 56, y + 2, { color: "#ffd98a", scale: 1, shadow: 1 });
    }

    this.plate(ctx, 10, 262, W - 20, 14, 0.74);
    drawText(ctx, `SPEED  ${this.speedName()}  SET IN THE MENU`, 100, 265, {
      color: "#bff0ff",
      scale: 1,
      align: "center",
    });

    if (Math.floor(this.t * 2) % 2 === 0) {
      drawText(ctx, "ENTER TO GO BACK", 100, 288, {
        color: "#ffffff",
        scale: 1,
        align: "center",
        shadow: 1,
      });
    }
  }

  private drawIntro(ctx: CanvasRenderingContext2D): void {
    const intro = this.intro;

    if (!intro) {
      return;
    }

    drawOcean(ctx, this.t * 8, this.t);
    drawStartIsland(ctx, intro.beachY, intro.swash, this.t);

    // The twin left behind on the dry sand.
    drawSpriteCentered(ctx, "flipflop", intro.sisterX, 214);

    // Damp outline where the hero was resting, once it has been taken.
    if (intro.grabbed) {
      ctx.fillStyle = "rgba(160,130,86,0.55)";
      ctx.fillRect(intro.pairX - 7, 203, 14, 23);
    }

    for (const particle of this.particles) {
      particle.draw(ctx);
    }

    ctx.save();
    ctx.translate(Math.round(intro.slideX), Math.round(intro.slideY));
    ctx.rotate(intro.slideRot);
    drawSpriteCentered(ctx, "flipflop", 0, 0);
    ctx.restore();

    this.plate(ctx, 10, 20, W - 20, 28, 0.72);
    drawText(ctx, intro.grabbed ? "THE SEA TAKES ONE" : "KOH SAMUI", 100, 25, {
      color: "#ffffff",
      scale: 1,
      align: "center",
    });
    drawText(
      ctx,
      intro.grabbed ? "HOLD ON" : "TWO SLIDES ON THE SAND",
      100,
      37,
      { color: "#bff0ff", scale: 1, align: "center" }
    );
  }

  private drawWorld(ctx: CanvasRenderingContext2D): void {
    drawOcean(ctx, this.scroll, this.t);

    const p = this.progress();
    // Goal island slides down from the horizon so landfall actually happens on screen.
    const approach = Math.max(0, (p - 0.62) / 0.38);
    const goalY = -40 + approach * approach * 268;

    if (p > 0.6) {
      drawGoalIsland(ctx, goalY, (p - 0.6) / 0.4);
    }

    if (this.startIslandY < H + 20) {
      drawStartIsland(ctx, this.startIslandY, 0, this.t);

      // The twin still sitting on the sand, shrinking into the distance.
      if (this.introSisterX !== undefined && this.startIslandY > -60) {
        drawSpriteCentered(
          ctx,
          "flipflop",
          this.introSisterX,
          this.startIslandY + 64,
          { alpha: 0.9 }
        );
      }
    }

    for (const hazard of this.hazards) {
      hazard.draw(ctx);
    }

    for (const pickup of this.pickups) {
      pickup.draw(ctx);
    }

    for (const particle of this.particles) {
      particle.draw(ctx);
    }

    this.player.draw(ctx);

    for (const float of this.floats) {
      float.draw(ctx);
    }

    this.drawHud(ctx);
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "rgba(8,24,40,0.72)";
    ctx.fillRect(0, 0, W, 26);
    ctx.fillStyle = "#ff9f1c";
    ctx.fillRect(0, 26, W, 1);

    drawText(ctx, String(Math.floor(this.score)).padStart(6, "0"), 5, 4, {
      color: "#ffd98a",
      scale: 2,
    });

    for (let i = 0; i < this.lives; i++) {
      drawSprite(ctx, "flipflopIcon", W - 10 - i * 9, 4);
    }

    if (this.combo > 1) {
      drawText(ctx, `X${this.combo}`, W / 2, 6, {
        color: "#ffe66d",
        scale: 1,
        align: "center",
      });
    }

    // Crossing progress bar: Koh Samui -> Koh Tao.
    const barX = 5;
    const barY = 19;
    const barW = W - 10;
    const barH = 4;
    ctx.fillStyle = "#0b2435";
    ctx.fillRect(barX, barY, barW, barH);

    const fill = Math.round(barW * this.progress());
    ctx.fillStyle = "#2f97cf";
    ctx.fillRect(barX, barY, fill, barH);
    ctx.fillStyle = "#63c6ea";
    ctx.fillRect(barX, barY, fill, 1);
    ctx.fillStyle = "#ffe66d";
    ctx.fillRect(barX + fill - 1, barY - 1, 2, barH + 2);
    ctx.fillStyle = "#e0c489";
    ctx.fillRect(barX + barW - 2, barY - 1, 2, barH + 2);

    drawText(ctx, `${this.km().toFixed(1)} / 75 KM`, W - 5, 30, {
      color: "#bff0ff",
      scale: 1,
      align: "right",
      shadow: 1,
    });
  }

  private drawGameOver(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "rgba(6,16,28,0.78)";
    ctx.fillRect(0, 0, W, H);

    drawText(ctx, "LOST", 100, 54, {
      color: "#ff7a5c",
      scale: 4,
      align: "center",
      shadow: 2,
      shadowColor: "#2b1a10",
    });
    drawText(ctx, "AT SEA", 100, 92, {
      color: "#ffd98a",
      scale: 3,
      align: "center",
      shadow: 2,
      shadowColor: "#2b1a10",
    });

    drawSpriteCentered(ctx, "flipflop", 100, 142, {
      scale: 2,
      alpha: 0.45 + Math.sin(this.t * 2) * 0.15,
    });

    this.drawPanel(ctx, 26, 176, W - 52, 62);
    drawText(ctx, "DRIFTED", 100, 186, {
      color: "#bff0ff",
      scale: 1,
      align: "center",
    });
    drawText(ctx, `${this.km().toFixed(1)} KM`, 100, 198, {
      color: "#ffffff",
      scale: 2,
      align: "center",
    });
    drawText(ctx, `SCORE ${Math.floor(this.score)}`, 100, 222, {
      color: "#ffd98a",
      scale: 1,
      align: "center",
    });

    if (this.stateT > 0.8 && Math.floor(this.t * 1.8) % 2 === 0) {
      drawText(
        ctx,
        this.scores.qualifies(this.score)
          ? "ENTER TO SIGN THE BOARD"
          : "ENTER FOR MENU",
        100,
        262,
        { color: "#ffffff", scale: 1, align: "center", shadow: 1 }
      );
    }
  }

  private drawVictory(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "rgba(10,40,20,0.72)";
    ctx.fillRect(0, 0, W, H);

    // Confetti of foam and sun.
    const confetti = ["#ffe66d", "#ffffff", "#7cf0a8", "#ff9f1c"] as const;

    for (let i = 0; i < 30; i++) {
      const x = (hash(i, 3) * W + this.t * 18 * ((i % 3) + 1)) % W;
      const y = (hash(i, 9) * H + this.t * 42 * ((i % 4) + 1)) % H;
      ctx.fillStyle = confetti[i % 4] as string;
      ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
    }

    drawText(ctx, "KOH TAO", 100, 44, {
      color: "#ffe66d",
      scale: 3,
      align: "center",
      shadow: 2,
      shadowColor: "#2b1a10",
    });
    drawText(ctx, "LANDFALL", 100, 76, {
      color: "#ffffff",
      scale: 3,
      align: "center",
      shadow: 2,
      shadowColor: "#2b1a10",
    });

    drawSpriteCentered(ctx, "flipflop", 100, 134, { scale: 2 });

    this.drawPanel(ctx, 20, 174, W - 40, 72);
    drawText(ctx, "75 KM CROSSED", 100, 184, {
      color: "#7cf0a8",
      scale: 1,
      align: "center",
    });
    drawText(ctx, Math.floor(this.score), 100, 198, {
      color: "#ffffff",
      scale: 3,
      align: "center",
    });
    drawText(ctx, "THE CLAQUETTE MADE IT", 100, 228, {
      color: "#ffd98a",
      scale: 1,
      align: "center",
    });

    if (this.stateT > 0.8 && Math.floor(this.t * 1.8) % 2 === 0) {
      drawText(ctx, "ENTER TO CONTINUE", 100, 272, {
        color: "#ffffff",
        scale: 1,
        align: "center",
        shadow: 1,
      });
    }
  }

  private drawEntry(ctx: CanvasRenderingContext2D): void {
    drawMenuBackdrop(ctx, this.t);
    drawText(ctx, "NEW", 100, 26, {
      color: "#ffffff",
      scale: 3,
      align: "center",
      shadow: 2,
      shadowColor: "#2b1a10",
    });
    drawText(ctx, "HIGH SCORE", 100, 58, {
      color: "#ffe66d",
      scale: 2,
      align: "center",
      shadow: 2,
      shadowColor: "#2b1a10",
    });

    this.drawPanel(ctx, 24, 96, W - 48, 110);
    drawText(ctx, this.pendingScore, 100, 108, {
      color: "#ffffff",
      scale: 2,
      align: "center",
    });
    drawText(ctx, `${this.pendingKm} KM DRIFTED`, 100, 130, {
      color: "#bff0ff",
      scale: 1,
      align: "center",
    });

    for (let i = 0; i < 3; i++) {
      const x = 64 + i * 36;
      const selected = i === this.entryIndex;

      if (selected) {
        ctx.fillStyle = "rgba(255,159,28,0.25)";
        ctx.fillRect(x - 14, 146, 28, 44);
        ctx.fillStyle = "#ff9f1c";
        ctx.fillRect(x - 14, 186, 28, 2);
      }

      drawText(ctx, this.entryName[i] ?? "A", x, 152, {
        color: selected ? "#ffffff" : "#ffd98a",
        scale: 4,
        align: "center",
      });

      if (selected && Math.floor(this.t * 4) % 2 === 0) {
        drawText(ctx, "<", x - 22, 162, { color: "#ffe66d", scale: 1 });
        drawText(ctx, ">", x + 17, 162, { color: "#ffe66d", scale: 1 });
      }
    }

    drawText(ctx, "UP DOWN PICKS A LETTER", 100, 226, {
      color: "#ffd98a",
      scale: 1,
      align: "center",
      shadow: 1,
    });
    drawText(ctx, "LEFT RIGHT MOVES", 100, 240, {
      color: "#ffd98a",
      scale: 1,
      align: "center",
      shadow: 1,
    });
    drawText(ctx, "OR JUST TYPE", 100, 254, {
      color: "#bff0ff",
      scale: 1,
      align: "center",
      shadow: 1,
    });

    if (Math.floor(this.t * 2) % 2 === 0) {
      drawText(ctx, "ENTER TO CONFIRM", 100, 280, {
        color: "#ffffff",
        scale: 1,
        align: "center",
        shadow: 1,
      });
    }
  }
}
