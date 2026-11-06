/** Procedural pixel ocean: depth bands, chop texture, sparkles, islands, menu backdrop. */

import { drawSprite } from "./sprites";

export const W = 200;
export const H = 320;

const CELL = 4;

/** Stable 2D value noise: the same cell always gets the same colour as the sea scrolls past. */
export const hash = (x: number, y: number): number => {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;

  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
};

const SEA = ["#0b4470", "#0d4f7c", "#126089", "#1a6ea8", "#2f97cf"] as const;

/** Draw the scrolling sea. `scroll` grows as the flip flop advances north. */
export const drawOcean = (
  ctx: CanvasRenderingContext2D,
  scroll: number,
  t: number
): void => {
  const baseRow = Math.floor(scroll / CELL);
  const offset = scroll % CELL;

  for (let cy = -1; cy <= H / CELL; cy++) {
    const worldRow = baseRow + cy;
    const py = cy * CELL - offset;

    for (let cx = 0; cx < W / CELL; cx++) {
      const n = hash(cx, worldRow);
      const band = hash(Math.floor(cx / 7), Math.floor(worldRow / 9));
      let idx = 1;

      if (band > 0.72) {
        idx = 2;
      } else if (band < 0.22) {
        idx = 0;
      }

      if (n > 0.93) {
        idx = Math.min(SEA.length - 1, idx + 2);
      } else if (n > 0.8) {
        idx = Math.min(SEA.length - 1, idx + 1);
      }

      ctx.fillStyle = SEA[idx] as string;
      ctx.fillRect(cx * CELL, py, CELL, CELL);
    }
  }

  // Drifting chop: short horizontal crests that slide sideways over time.
  const drift = Math.floor(t * 9);
  ctx.fillStyle = "#63c6ea";

  for (let i = 0; i < 46; i++) {
    const sy = ((i * 53) % (H + 40)) - 20;
    const r = hash(i, Math.floor((scroll + sy) / 160));

    if (r < 0.45) {
      continue;
    }

    const y = (((sy - (scroll % (H + 40)) + H + 40) % (H + 40)) - 20) as number;
    let x = (Math.floor(r * W) + drift * (r > 0.7 ? 1 : -1)) % W;

    if (x < 0) {
      x += W;
    }

    const len = 3 + Math.floor(r * 6);
    ctx.fillRect(x, y, len, 1);

    if (r > 0.8) {
      ctx.fillRect(x + 2, y + 2, Math.max(2, len - 3), 1);
    }
  }

  // Sun sparkles.
  ctx.fillStyle = "#bff0ff";

  for (let s = 0; s < 18; s++) {
    const phase = (t * 1.4 + s * 0.37) % 2;

    if (phase > 0.55) {
      continue;
    }

    const sx = Math.floor(hash(s, 7) * W);
    let sy = Math.floor((hash(s, 11) * (H + 60) - scroll * 0.35) % (H + 60));

    if (sy < 0) {
      sy += H + 60;
    }

    sy -= 30;
    ctx.fillRect(sx, sy, 1, 1);

    if (phase < 0.25) {
      ctx.fillRect(sx - 1, sy, 1, 1);
      ctx.fillRect(sx + 1, sy, 1, 1);
      ctx.fillRect(sx, sy - 1, 1, 1);
      ctx.fillRect(sx, sy + 1, 1, 1);
    }
  }
};

/**
 * Koh Samui beach at the start of the run: a deep stretch of sand with wet-sand shading, scattered
 * shells and palms along the treeline. `swash` (0..1) runs a sheet of water up the sand for the
 * intro cutscene.
 */
export const drawStartIsland = (
  ctx: CanvasRenderingContext2D,
  y: number,
  swash = 0,
  t = 0
): void => {
  if (y < -220) {
    return;
  }

  // Surf line at the waterline.
  ctx.fillStyle = "#bff0ff";
  ctx.fillRect(0, y, W, 3);
  ctx.fillStyle = "#ffffff";

  for (let fx = 0; fx < W; fx += 7) {
    ctx.fillRect(fx + ((Math.floor(y) + fx) % 3), y + 1, 4, 1);
  }

  // Wet sand, then dry sand all the way down: a much deeper beach.
  ctx.fillStyle = "#d8bc86";
  ctx.fillRect(0, y + 3, W, 16);
  ctx.fillStyle = "#f4e4b8";
  ctx.fillRect(0, y + 19, W, 22);
  ctx.fillStyle = "#e0c489";
  ctx.fillRect(0, y + 41, W, Math.max(0, H - (y + 41)));

  // Sand speckle and shells.
  ctx.fillStyle = "#b9955c";

  for (let dx = 0; dx < W; dx += 5) {
    const d = (dx * 31) % 97;
    ctx.fillRect(dx, y + 26 + (d % 13), 2, 1);
    ctx.fillRect((dx * 3) % W, y + 46 + (d % 23), 1, 1);
    ctx.fillRect((dx * 7 + 13) % W, y + 72 + (d % 31), 1, 1);
  }

  ctx.fillStyle = "#f4e4b8";

  for (let sh = 0; sh < 10; sh++) {
    const shx = Math.floor(hash(sh, 21) * W);
    const shy = y + 54 + Math.floor(hash(sh, 33) * 70);
    ctx.fillRect(shx, shy, 2, 1);
    ctx.fillRect(shx, shy - 1, 1, 1);
  }

  // Treeline along the top of the sand.
  drawSprite(ctx, "palm", 8, y + 24);
  drawSprite(ctx, "palm", 36, y + 34, { flipX: true });
  drawSprite(ctx, "palm", 158, y + 28, { flipX: true });
  drawSprite(ctx, "palm", 182, y + 40);
  drawSprite(ctx, "parasol", 120, y + 44);

  // Swash: a thin sheet of water sliding up the sand and soaking it.
  if (swash > 0) {
    const run = Math.round(swash * 58);
    const edge = y + 3 + run;

    ctx.fillStyle = "rgba(47,151,207,0.55)";
    ctx.fillRect(0, y + 3, W, run);
    ctx.fillStyle = "rgba(191,240,255,0.75)";

    for (let wx = 0; wx < W; wx++) {
      const lip = Math.sin(wx * 0.18 + t * 3) * 2;
      ctx.fillRect(wx, Math.round(edge + lip), 1, 2);
    }

    ctx.fillStyle = "#ffffff";

    for (let fo = 0; fo < W; fo += 4) {
      const lip = Math.sin(fo * 0.18 + t * 3) * 2;

      if ((fo + Math.floor(t * 9)) % 8 < 3) {
        ctx.fillRect(fo, Math.round(edge + lip - 1), 2, 1);
      }
    }
  }
};

/** Koh Tao on the horizon, growing as you close the distance. */
export const drawGoalIsland = (
  ctx: CanvasRenderingContext2D,
  y: number,
  progress: number
): void => {
  if (y > H + 10) {
    return;
  }

  const grow = Math.max(0, Math.min(1, progress));
  const height = Math.round(10 + grow * 70);

  ctx.fillStyle = "#126089";
  ctx.fillRect(0, y - height - 2, W, 2);

  // Hill silhouette, three sine harmonics so it reads as a believable little island.
  ctx.fillStyle = "#1f7a3d";

  for (let x = 0; x < W; x++) {
    const nx = x / W;
    const hh = Math.max(
      0,
      Math.sin(nx * Math.PI) * height +
        Math.sin(nx * Math.PI * 3.3) * height * 0.16 +
        Math.sin(nx * Math.PI * 7.1) * height * 0.07
    );
    ctx.fillRect(x, y - hh, 1, hh);
  }

  ctx.fillStyle = "#36a95b";

  for (let x = 0; x < W; x++) {
    const nx = x / W;
    const hh = Math.max(
      0,
      Math.sin(nx * Math.PI) * height * 0.72 +
        Math.sin(nx * Math.PI * 4.1) * height * 0.1
    );
    ctx.fillRect(x, y - hh, 1, Math.max(0, hh - height * 0.1));
  }

  ctx.fillStyle = "#63d183";

  for (let x = 0; x < W; x += 3) {
    const hh = Math.sin((x / W) * Math.PI) * height * 0.5;

    if (hh > 4) {
      ctx.fillRect(x, y - hh, 2, 1);
    }
  }

  // Beach strip and surf line.
  const beach = Math.max(2, Math.round(2 + grow * 5));
  ctx.fillStyle = "#f4e4b8";
  ctx.fillRect(0, y, W, beach);

  const foamY = y + beach;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, foamY, W, 1);

  for (let f = 0; f < W; f += 6) {
    ctx.fillRect(f + ((f / 6) % 2), foamY + 1, 3, 1);
  }

  if (grow > 0.45) {
    drawSprite(ctx, "palm", 30, y - 20);
    drawSprite(ctx, "palm", 110, y - 26, { flipX: true });
    drawSprite(ctx, "palm", 160, y - 16);
  }
};

/** Decorative sunset strip used behind the menus. */
export const drawMenuBackdrop = (
  ctx: CanvasRenderingContext2D,
  t: number
): void => {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#ffb35c");
  gradient.addColorStop(0.28, "#ff7f50");
  gradient.addColorStop(0.46, "#9b5fb0");
  gradient.addColorStop(0.62, "#2f6f9f");
  gradient.addColorStop(1, "#0b4470");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  // Pixel sun with scanline cut-outs.
  const sunY = 92;
  ctx.fillStyle = "#ffe66d";

  for (let y = -26; y <= 26; y++) {
    const half = Math.floor(Math.sqrt(Math.max(0, 26 * 26 - y * y)));

    if (half <= 0 || (y > 2 && (y + 40) % 6 < 2)) {
      continue;
    }

    ctx.fillRect(100 - half, sunY + y, half * 2, 1);
  }

  ctx.fillStyle = "#fff3b0";

  for (let y = -26; y <= -6; y++) {
    const half = Math.floor(Math.sqrt(Math.max(0, 22 * 22 - y * y)));

    if (half > 0) {
      ctx.fillRect(100 - half, sunY + y, half * 2, 1);
    }
  }

  // Far island silhouettes.
  ctx.fillStyle = "#1b4a63";

  for (let x = 0; x < W; x++) {
    const nx = (x - 24) / 70;
    const hh = Math.max(0, Math.sin(nx * Math.PI) * 26);

    if (nx >= 0 && nx <= 1) {
      ctx.fillRect(x, 150 - hh, 1, hh + 4);
    }

    const nx2 = (x - 118) / 58;
    const hh2 = Math.max(0, Math.sin(nx2 * Math.PI) * 18);

    if (nx2 >= 0 && nx2 <= 1) {
      ctx.fillRect(x, 152 - hh2, 1, hh2 + 4);
    }
  }

  // Sea with a sun road.
  ctx.fillStyle = "#0d4f7c";
  ctx.fillRect(0, 154, W, H - 154);

  for (let row = 154; row < H; row += 2) {
    const depth = (row - 154) / (H - 154);
    ctx.fillStyle = depth > 0.6 ? "#0b4470" : "#126089";
    ctx.fillRect(0, row, W, 1);
  }

  ctx.fillStyle = "#ffb35c";

  for (let r = 154; r < H; r += 3) {
    const spread = 6 + (r - 154) * 0.45;
    const wobble = Math.sin(t * 2 + r * 0.3) * 3;
    ctx.fillRect(Math.round(100 - spread / 2 + wobble), r, Math.round(spread), 1);
  }

  ctx.fillStyle = "#ffd98a";

  for (let r = 158; r < H; r += 7) {
    const spread = 4 + (r - 154) * 0.3;
    const wobble = Math.sin(t * 2.6 + r * 0.22) * 4;
    ctx.fillRect(Math.round(100 - spread / 2 + wobble), r, Math.round(spread), 1);
  }
};
