import { describe, expect, test } from "bun:test";

import { PALETTE } from "./palette";
import { SPRITES } from "./sprites";

/**
 * The atlas compiles at module load, so a ragged row or an unknown palette character already
 * throws before these run. What is left to check is that the compiled form still describes the
 * art it was authored from.
 */
describe("sprite atlas", () => {
  const names = Object.keys(SPRITES);

  test("compiles every authored sprite", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  test.each(names)("%s is rectangular and non-empty", (name) => {
    const sprite = SPRITES[name as keyof typeof SPRITES];

    expect(sprite.w).toBeGreaterThan(0);
    expect(sprite.h).toBe(sprite.rows.length);

    for (const row of sprite.rows) {
      expect(row).toHaveLength(sprite.w);
    }
  });

  test.each(names)("%s runs stay inside its bounds", (name) => {
    const sprite = SPRITES[name as keyof typeof SPRITES];

    for (const [x, y, length, color] of sprite.runs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + length).toBeLessThanOrEqual(sprite.w);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(sprite.h);
      expect(length).toBeGreaterThan(0);
      expect(color).toMatch(/^#[0-9a-f]{6}$/u);
    }
  });

  test.each(names)("%s runs cover exactly its opaque pixels", (name) => {
    const sprite = SPRITES[name as keyof typeof SPRITES];

    const opaque = sprite.rows.reduce(
      (total, row) =>
        total + [...row].filter((char) => PALETTE[char] !== null).length,
      0
    );
    const covered = sprite.runs.reduce((total, [, , length]) => total + length, 0);

    expect(covered).toBe(opaque);
  });
});
