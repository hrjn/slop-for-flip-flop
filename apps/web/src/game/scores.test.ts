import { beforeEach, describe, expect, test } from "bun:test";

import { MAX_SCORES, ScoreBoard, SEED } from "./scores";
import type { ScoreEntry, ScoresTransport } from "./scores";

const clearStorage = (): void => {
  window.localStorage.clear();
};

/** A transport whose answers the test controls, standing in for the API. */
const transportOf = (
  remote: readonly ScoreEntry[],
  onSubmit?: (entry: ScoreEntry) => readonly ScoreEntry[] | Promise<never>
): ScoresTransport => ({
  list: () => Promise.resolve(remote),
  submit: (entry) => Promise.resolve(onSubmit?.(entry) ?? remote),
});

describe("ScoreBoard", () => {
  beforeEach(clearStorage);

  test("opens on the seed board when nothing is stored", () => {
    expect(new ScoreBoard().load()).toEqual([...SEED]);
  });

  test("keeps the board sorted and capped at the board size", () => {
    const board = new ScoreBoard();
    board.submit("ZZZ", 9999, 75);

    const entries = board.load();

    expect(entries).toHaveLength(MAX_SCORES);
    expect(entries[0]).toEqual({ name: "ZZZ", score: 9999, km: 75 });
    expect(entries.map((entry) => entry.score)).toEqual(
      [...entries.map((entry) => entry.score)].sort((a, b) => b - a)
    );
  });

  test("normalizes a submitted name to three uppercase initials", () => {
    const board = new ScoreBoard();
    board.submit("abcdef", 9999, 10);

    expect(board.load()[0]?.name).toBe("ABC");
  });

  test("qualifies only a score that beats the last place", () => {
    const board = new ScoreBoard();
    const last = SEED[SEED.length - 1] as ScoreEntry;

    expect(board.qualifies(last.score + 1)).toBe(true);
    expect(board.qualifies(last.score)).toBe(false);
    expect(board.qualifies(0)).toBe(false);
  });

  test("rankOf places a score, and refuses one that misses the board", () => {
    const board = new ScoreBoard();

    expect(board.rankOf(99_999)).toBe(1);
    expect(board.rankOf(1)).toBe(-1);
  });

  test("persists across instances through localStorage", () => {
    new ScoreBoard().submit("AAA", 12_345, 70);

    expect(new ScoreBoard().load()[0]).toEqual({
      name: "AAA",
      score: 12_345,
      km: 70,
    });
  });

  test("adopts the shared board on refresh", async () => {
    const remote = [{ name: "NET", score: 4242, km: 42 }];
    const board = new ScoreBoard(transportOf(remote));

    await board.refresh();

    expect(board.load()).toEqual(remote);
  });

  test("keeps the local board when the API cannot be reached", async () => {
    const board = new ScoreBoard({
      list: () => Promise.reject(new Error("offline")),
      submit: () => Promise.reject(new Error("offline")),
    });

    await board.refresh();

    expect(board.load()).toEqual([...SEED]);
  });

  test("records a run locally even when the submit never lands", () => {
    const board = new ScoreBoard({
      list: () => Promise.reject(new Error("offline")),
      submit: () => Promise.reject(new Error("offline")),
    });

    board.submit("OFF", 9999, 75);

    expect(board.load()[0]).toEqual({ name: "OFF", score: 9999, km: 75 });
  });

  test("notifies subscribers when the board changes", () => {
    const board = new ScoreBoard();
    let calls = 0;
    const unsubscribe = board.subscribe(() => {
      calls++;
    });

    board.submit("SUB", 9999, 75);
    unsubscribe();
    board.submit("OFF", 9998, 74);

    expect(calls).toBe(1);
  });
});
