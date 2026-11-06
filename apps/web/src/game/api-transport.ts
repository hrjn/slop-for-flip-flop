/**
 * The board's API transport: the generated client, narrowed to what `ScoreBoard` needs.
 *
 * It throws on failure rather than swallowing anything — `ScoreBoard` is the one place that
 * decides what a missing API means, which is "keep the local board".
 */

import { scoresList, scoresSubmit } from "../api/generated";
import { unwrap } from "../api/unwrap";
import type { ScoreEntry, ScoresTransport } from "./scores";

export const apiScoresTransport: ScoresTransport = {
  list: async (): Promise<readonly ScoreEntry[]> =>
    unwrap(scoresList({ throwOnError: true })),

  submit: async (entry: ScoreEntry): Promise<readonly ScoreEntry[]> =>
    unwrap(scoresSubmit({ body: entry, throwOnError: true })),
};
