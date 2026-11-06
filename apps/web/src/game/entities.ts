/**
 * Hazards, pickups and particles. They share a tiny interface — `update(dt, world)` and
 * `draw(ctx)` — plus an AABB hitbox, so the game loop treats them uniformly.
 */

import { drawText } from "./font";
import { drawSpriteCentered, getSprite } from "./sprites";
import type { Sprite } from "./sprites";
import { H, W } from "./world";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a hazard reads of the game while updating. Keeps entities free of the state machine. */
export interface WorldView {
  readonly scrollSpeed: number;
  readonly player: { readonly x: number; readonly y: number };
}

export interface Input {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  pointer: boolean;
  pointerX: number;
  pointerY: number;
}

export type HazardType = "surfer" | "shark" | "wave";
export type PickupKind = "coconut" | "star" | "turtle";

export const rectsOverlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/* ------------------------------------------------------------------- hero */

export class FlipFlop {
  readonly sprite: Sprite = getSprite("flipflop");
  x = W / 2;
  y = H - 70;
  vx = 0;
  vy = 0;
  angle = 0;
  bob = 0;
  invuln = 0;
  boost = 0;

  hitbox(): Box {
    return { x: this.x - 4, y: this.y - 7, w: 8, h: 14 };
  }

  update(dt: number, input: Input): void {
    const accel = 520;
    const maxV = 112;
    let ax = 0;
    let ay = 0;

    if (input.left) {
      ax -= accel;
    }

    if (input.right) {
      ax += accel;
    }

    if (input.up) {
      ay -= accel * 0.78;
    }

    if (input.down) {
      ay += accel * 0.78;
    }

    if (input.pointer) {
      const dx = input.pointerX - this.x;
      const dy = input.pointerY - this.y;
      ax += Math.max(-accel, Math.min(accel, dx * 14));
      ay += Math.max(-accel, Math.min(accel, dy * 14));
    }

    this.vx += ax * dt;
    this.vy += ay * dt;

    // Water drag, plus a gentle westward current for flavour.
    const drag = Math.pow(0.0016, dt);
    this.vx *= drag;
    this.vy *= drag;
    this.vx += Math.sin(this.bob * 0.6) * 5 * dt;

    this.vx = Math.max(-maxV, Math.min(maxV, this.vx));
    this.vy = Math.max(-maxV, Math.min(maxV, this.vy));

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.x = Math.max(8, Math.min(W - 8, this.x));
    this.y = Math.max(40, Math.min(H - 18, this.y));

    this.bob += dt * 3.4;
    this.angle = this.vx * 0.0045 + Math.sin(this.bob) * 0.05;

    if (this.invuln > 0) {
      this.invuln -= dt;
    }

    if (this.boost > 0) {
      this.boost -= dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // Blink through invulnerability so a hit reads even while the hero is untouchable.
    if (this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0) {
      return;
    }

    const px = Math.round(this.x);
    const py = Math.round(this.y + Math.sin(this.bob) * 1.2);

    ctx.fillStyle = "rgba(191,240,255,0.55)";

    for (let i = 0; i < 3; i++) {
      const width = 6 - i * 2;
      ctx.fillRect(px - width / 2, py + 11 + i * 3, width, 1);
    }

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(this.angle);

    if (this.boost > 0) {
      ctx.globalAlpha = 0.5;
      drawSpriteCentered(ctx, this.sprite, 0, 2, { tint: "#ffe66d" });
      ctx.globalAlpha = 1;
    }

    drawSpriteCentered(ctx, this.sprite, 0, 0);
    ctx.restore();
  }
}

/* ---------------------------------------------------------------- hazards */

export interface Hazard {
  readonly type: HazardType;
  readonly y: number;
  dead: boolean;
  update(dt: number, world: WorldView): void;
  draw(ctx: CanvasRenderingContext2D): void;
  /** A wave spans the screen, so it tests the box itself; the others expose an AABB. */
  hitbox?(): Box;
  hits?(box: Box): boolean;
}

export class Surfer implements Hazard {
  readonly type = "surfer" as const;
  t = Math.random() * 6.28;
  dead = false;

  constructor(
    public x: number,
    public y: number,
    private speed: number,
    private drift: number
  ) {}

  hitbox(): Box {
    return { x: this.x - 6, y: this.y - 8, w: 12, h: 16 };
  }

  update(dt: number, world: WorldView): void {
    this.t += dt * 2.2;
    this.y += (this.speed + world.scrollSpeed) * dt;
    this.x += Math.sin(this.t) * this.drift * dt;

    if (this.x < 10 || this.x > W - 10) {
      this.drift *= -1;
    }

    if (this.y > H + 30) {
      this.dead = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    ctx.rotate(Math.sin(this.t) * 0.12);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(-5, -13, 10, 1);
    ctx.fillRect(-3, -15, 6, 1);
    drawSpriteCentered(ctx, "surfer", 0, 0);
    ctx.restore();
  }
}

export class Shark implements Hazard {
  readonly type = "shark" as const;
  t = 0;
  dead = false;

  constructor(
    public x: number,
    public y: number,
    private speed: number
  ) {}

  hitbox(): Box {
    return { x: this.x - 5, y: this.y - 10, w: 10, h: 20 };
  }

  update(dt: number, world: WorldView): void {
    this.t += dt;

    // Sharks track the flip flop, but lazily: sitting still is what gets you eaten.
    const dx = world.player.x - this.x;
    this.x += Math.max(-34, Math.min(34, dx * 1.5)) * dt;
    this.x += Math.sin(this.t * 3) * 10 * dt;
    this.y += (this.speed + world.scrollSpeed) * dt;
    this.x = Math.max(8, Math.min(W - 8, this.x));

    if (this.y > H + 30) {
      this.dead = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    ctx.rotate(Math.sin(this.t * 6) * 0.1);
    ctx.fillStyle = "rgba(191,240,255,0.5)";
    ctx.fillRect(-6, 12, 12, 1);
    drawSpriteCentered(ctx, "shark", 0, 0, { flipY: true });
    ctx.restore();
  }
}

/** Rolling wave band with one navigable gap that drifts sideways as it falls. */
export class Wave implements Hazard {
  readonly type = "wave" as const;
  readonly h = 12;
  t = Math.random() * 6.28;
  dead = false;

  constructor(
    public y: number,
    public gapX: number,
    private gapW: number,
    private speed: number
  ) {}

  update(dt: number, world: WorldView): void {
    this.t += dt * 3;
    this.y += (this.speed + world.scrollSpeed) * dt;
    this.gapX += Math.sin(this.t * 0.5) * 11 * dt;
    this.gapX = Math.max(
      this.gapW / 2 + 4,
      Math.min(W - this.gapW / 2 - 4, this.gapX)
    );

    if (this.y > H + 30) {
      this.dead = true;
    }
  }

  hits(box: Box): boolean {
    if (box.y + box.h < this.y || box.y > this.y + this.h) {
      return false;
    }

    const left = this.gapX - this.gapW / 2;
    const right = this.gapX + this.gapW / 2;

    return !(box.x > left && box.x + box.w < right);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const gapL = Math.round(this.gapX - this.gapW / 2);
    const gapR = Math.round(this.gapX + this.gapW / 2);
    const y = Math.round(this.y);

    for (let x = 0; x < W; x++) {
      if (x > gapL && x < gapR) {
        continue;
      }

      const top = y + Math.sin(x * 0.22 + this.t) * 1.6;
      ctx.fillStyle = "#2f97cf";
      ctx.fillRect(x, top + 5, 1, 7);
      ctx.fillStyle = "#63c6ea";
      ctx.fillRect(x, top + 2, 1, 3);
      ctx.fillStyle = "#bff0ff";
      ctx.fillRect(x, top, 1, 2);

      if ((x + Math.floor(this.t * 6)) % 5 === 0) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, top - 1, 1, 2);
      }
    }

    // Foam shoulders framing the gap, so it is visible from the top of the screen.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(gapL - 1, y - 2, 2, this.h + 2);
    ctx.fillRect(gapR - 1, y - 2, 2, this.h + 2);
  }
}

/* ---------------------------------------------------------------- pickups */

export class Pickup {
  t = Math.random() * 6.28;
  dead = false;

  constructor(
    readonly kind: PickupKind,
    public x: number,
    public y: number,
    private speed: number
  ) {}

  hitbox(): Box {
    const r = this.kind === "turtle" ? 7 : 5;

    return { x: this.x - r, y: this.y - r, w: r * 2, h: r * 2 };
  }

  update(dt: number, world: WorldView): void {
    this.t += dt * 3;
    this.y += (this.speed + world.scrollSpeed) * dt;
    this.x += Math.sin(this.t * 0.8) * 7 * dt;

    if (this.y > H + 20) {
      this.dead = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const bob = Math.sin(this.t) * 1.5;

    if (this.kind === "star") {
      ctx.globalAlpha = 0.6 + Math.sin(this.t * 3) * 0.4;
      drawSpriteCentered(ctx, "star", this.x, this.y + bob + 1, {
        tint: "#fff3b0",
      });
      ctx.globalAlpha = 1;
      drawSpriteCentered(ctx, "star", this.x, this.y + bob);
    } else {
      drawSpriteCentered(ctx, this.kind, this.x, this.y + bob);
    }
  }
}

/* -------------------------------------------------------------- particles */

export class Particle {
  readonly maxLife: number;
  dead = false;

  constructor(
    public x: number,
    public y: number,
    private vx: number,
    private vy: number,
    public life: number,
    private color: string,
    private size = 1
  ) {
    this.maxLife = life;
  }

  update(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 0.94;
    this.vy *= 0.94;
    this.life -= dt;

    if (this.life <= 0) {
      this.dead = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
    ctx.fillStyle = this.color;
    ctx.fillRect(Math.round(this.x), Math.round(this.y), this.size, this.size);
    ctx.globalAlpha = 1;
  }
}

export class FloatText {
  life = 1.1;
  dead = false;

  constructor(
    public x: number,
    public y: number,
    private text: string,
    private color = "#ffd98a"
  ) {}

  update(dt: number): void {
    this.y -= 22 * dt;
    this.life -= dt;

    if (this.life <= 0) {
      this.dead = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.globalAlpha = Math.max(0, Math.min(1, this.life / 0.6));
    drawText(ctx, this.text, this.x, this.y, {
      color: this.color,
      scale: 1,
      align: "center",
      shadow: 1,
    });
    ctx.globalAlpha = 1;
  }
}
