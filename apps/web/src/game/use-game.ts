/**
 * The React side of the game: one effect that mounts the engine onto a canvas and tears it down.
 *
 * Everything the engine touches — `window`, `document`, `localStorage`, WebAudio — is reached only
 * from inside `mountGame`, which runs in an effect, so the page server-renders without them.
 */

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { mountGame } from "./runtime";
import { ScoreBoard } from "./scores";
import type { ScoreEntry, ScoresTransport } from "./scores";

export interface UseGameResult {
  /** Attach to the game's `<canvas>`. */
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  /** The board, mirrored out of the engine so the page can render it beside the canvas. */
  readonly scores: readonly ScoreEntry[];
  /** False until the engine is running: on the server, and where canvas is unavailable. */
  readonly running: boolean;
}

export const useGame = (transport?: ScoresTransport): UseGameResult => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scores, setScores] = useState<readonly ScoreEntry[]>([]);
  const [running, setRunning] = useState(false);

  // The transport is captured once: swapping it mid-run would restart the game.
  const transportRef = useRef(transport);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const board = new ScoreBoard(transportRef.current);
    setScores(board.load());

    const unsubscribe = board.subscribe(() => {
      setScores(board.load());
    });

    void board.refresh();

    const mounted = mountGame(canvas, board);
    setRunning(mounted !== null);

    return () => {
      unsubscribe();
      mounted?.destroy();
      setRunning(false);
    };
  }, []);

  return { canvasRef, scores, running };
};
