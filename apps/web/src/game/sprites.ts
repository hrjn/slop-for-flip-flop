/**
 * Pixel-art atlas. Every sprite is authored as rows of palette characters and compiled once, at
 * module load, into horizontal colour runs so a blit is a handful of `fillRect` calls.
 */

import { PALETTE } from "./palette";

/* ------------------------------------------------------------------- hero */
/* The Mistral claquette: a black slide seen from above. Flat rubber band across the middle, a bold
   white M on the footbed, rounded toe and heel. The M uses 2px strokes so it stays legible at
   native resolution. */
const ART = {
  flipflop: [
    "....111111....",
    "..1155555511..",
    ".1155555555511",
    "11566666666511",
    "11544555544511",
    "11544455444511",
    "11544544544511",
    "11544555544511",
    "11544555544511",
    "11555555555511",
    "11566666666511",
    "11222222222211",
    "12222222222221",
    "12333333333321",
    "12222222222221",
    "12222222222221",
    "11222222222211",
    "11222222222211",
    "11555555555511",
    "11566666666511",
    "11555555555511",
    ".115555555511.",
    "..1111111111..",
    "....111111....",
  ],

  /* Small HUD icon for remaining lives: the same slide, miniaturised. The M is reduced to a 5x3
     suggestion, which is all that survives here. */
  flipflopIcon: [
    ".11111.",
    "1555551",
    "1545451",
    "1544451",
    "1222221",
    "1233321",
    "1555551",
    "1555551",
    ".11111.",
  ],

  /* Shark, top-down, nose up. Flip vertically for the ones cruising down. */
  shark: [
    "......hh......",
    ".....hHHh.....",
    ".....hHHh.....",
    "....hHHHHh....",
    "....hHHHHh....",
    "...hHHiiHHh...",
    "...hHHiiHHh...",
    "..hHHHiiHHHh..",
    "hhHHHHiiHHHHhh",
    "hHHHHHiiHHHHHh",
    "..hHHHhhHHHh..",
    "...hHHhhHHh...",
    "...hHHhhHHh...",
    "...hHHhhHHh...",
    "....hHiiHh....",
    "....hHiiHh....",
    "....hHIIHh....",
    ".....hIIh.....",
    ".....hIIh.....",
    "...hhIIIIhh...",
    "..hHh....hHh..",
    ".hh........hh.",
  ],

  /* Surfer paddling on a board, top-down. */
  surfer: [
    "......gg......",
    ".....gGGg.....",
    "....gGGGGg....",
    "...gGGssGGg...",
    "...gGsssSGg...",
    "...gGGssGGg...",
    "..gGGrrrrGGg..",
    "..gsrrrrrrsg..",
    "ssgrrrrrrrrgss",
    ".sgGrrrrrrGgs.",
    "..gGGrrrrGGg..",
    "..gGGrrrrGGg..",
    "..gGGRRRRGGg..",
    "..gGGSSSSGGg..",
    "...gGSSSSGg...",
    "...gGGssGGg...",
    "....gGssGg....",
    ".....gGGg.....",
    "......gg......",
  ],

  coconut: [
    "..eeeee..",
    ".eEEEEEe.",
    "eEEEeeEEe",
    "eEEeeeEEe",
    "eEEEEEEEe",
    "eEEeEeEEe",
    "eEEEEEEEe",
    ".eEEEEEe.",
    "..eeeee..",
  ],

  star: [
    "....z....",
    "...zZz...",
    "...zZz...",
    "zzzZZZzzz",
    ".zZZZZZz.",
    "..zZZZz..",
    "..zZ.Zz..",
    ".zz...zz.",
    ".z.....z.",
  ],

  turtle: [
    ".....vvv.....",
    "....vVUVv....",
    ".vv..vVv..vv.",
    "vVv.vVVVv.vVv",
    "vVvvVUUUVvvVv",
    ".vvVUVVVUVvv.",
    "..vVVUVUVVv..",
    "..vVUVVVUVv..",
    "..vVVVUVVVv..",
    ".vv.vVVVv.vv.",
    "vVv..vvv..vVv",
    ".v.........v.",
  ],

  palm: [
    "...vVVVv...",
    "..vUUUUUv..",
    ".vUVVVVVUv.",
    "vUVVvvvVVUv",
    ".vVv.e.vVv.",
    "....eEe....",
    "....eEe....",
    "....eEe....",
    "....eEe....",
    "...eEe.....",
    "...eEe.....",
    "..eEEe.....",
    "..eEEe.....",
    ".jjjjjjj...",
  ],

  parasol: [
    ".....r.....",
    "...rrRrr...",
    ".rrRRRRRrr.",
    "rRRwwRwwRRr",
    ".....e.....",
    ".....e.....",
    ".....e.....",
    ".....e.....",
  ],
} as const satisfies Record<string, readonly string[]>;

export type SpriteName = keyof typeof ART;

/** `[x, y, length, color]` — one horizontal run of a single colour. */
type Run = readonly [number, number, number, string];

export interface Sprite {
  readonly name: SpriteName;
  readonly w: number;
  readonly h: number;
  readonly runs: readonly Run[];
  readonly rows: readonly string[];
}

const compile = (name: SpriteName, rows: readonly string[]): Sprite => {
  const h = rows.length;
  const w = (rows[0] ?? "").length;
  const runs: Run[] = [];

  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? "";

    if (row.length !== w) {
      throw new Error(
        `sprite "${name}" row ${y} is ${row.length} chars, expected ${w}`
      );
    }

    let runStart = -1;
    let runColor: string | null = null;

    // Runs to `w` inclusive: the extra step has no character, which closes the last run.
    for (let x = 0; x <= w; x++) {
      const char = x < w ? (row[x] ?? null) : null;

      if (char !== null && !(char in PALETTE)) {
        throw new Error(`sprite "${name}" uses unknown palette char "${char}"`);
      }

      const color = char === null ? null : (PALETTE[char] ?? null);

      if (color !== runColor) {
        if (runColor !== null) {
          runs.push([runStart, y, x - runStart, runColor]);
        }

        runStart = x;
        runColor = color;
      }
    }
  }

  return { name, w, h, runs, rows };
};

export const SPRITES = Object.fromEntries(
  Object.entries(ART).map(([name, rows]) => [
    name,
    compile(name as SpriteName, rows),
  ])
) as Record<SpriteName, Sprite>;

export const getSprite = (name: SpriteName): Sprite => SPRITES[name];

export interface SpriteOptions {
  flipX?: boolean;
  flipY?: boolean;
  alpha?: number;
  scale?: number;
  /** Paint every run in this colour instead of its own: a flat silhouette for glows and ghosts. */
  tint?: string;
}

const resolve = (sprite: SpriteName | Sprite): Sprite =>
  typeof sprite === "string" ? SPRITES[sprite] : sprite;

/** Blit a compiled sprite with its top-left at `x`/`y`, in game pixels. */
export const drawSprite = (
  ctx: CanvasRenderingContext2D,
  sprite: SpriteName | Sprite,
  x: number,
  y: number,
  options: SpriteOptions = {}
): void => {
  const resolved = resolve(sprite);
  const { scale = 1, alpha = 1, tint } = options;

  if (alpha <= 0) {
    return;
  }

  const fx = options.flipX ? -1 : 1;
  const fy = options.flipY ? -1 : 1;
  const transformed = fx < 0 || fy < 0 || scale !== 1;

  ctx.save();

  if (alpha !== 1) {
    ctx.globalAlpha = alpha;
  }

  if (transformed) {
    ctx.translate(
      Math.round(x) + (fx < 0 ? resolved.w * scale : 0),
      Math.round(y) + (fy < 0 ? resolved.h * scale : 0)
    );
    ctx.scale(fx * scale, fy * scale);
  } else {
    ctx.translate(Math.round(x), Math.round(y));
  }

  if (tint !== undefined) {
    ctx.fillStyle = tint;

    for (const [rx, ry, length] of resolved.runs) {
      ctx.fillRect(rx, ry, length, 1);
    }
  } else {
    for (const [rx, ry, length, color] of resolved.runs) {
      ctx.fillStyle = color;
      ctx.fillRect(rx, ry, length, 1);
    }
  }

  ctx.restore();
};

/** Blit a sprite centred on `cx`/`cy`. */
export const drawSpriteCentered = (
  ctx: CanvasRenderingContext2D,
  sprite: SpriteName | Sprite,
  cx: number,
  cy: number,
  options: SpriteOptions = {}
): void => {
  const resolved = resolve(sprite);
  const scale = options.scale ?? 1;

  drawSprite(
    ctx,
    resolved,
    cx - (resolved.w * scale) / 2,
    cy - (resolved.h * scale) / 2,
    options
  );
};
