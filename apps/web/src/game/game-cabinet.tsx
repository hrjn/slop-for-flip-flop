/**
 * The arcade cabinet around the canvas: the wood-and-brass frame, and the hint line under it.
 *
 * The canvas is a fixed 200x320 grid of game pixels, scaled to a whole multiple by `runtime.ts`
 * and left crisp by `image-rendering: pixelated` — a fractional scale would resample the grid and
 * the art would go soft.
 */

import { apiScoresTransport } from "./api-transport";
import { useGame } from "./use-game";
import { H, W } from "./world";

const HINTS = [
  "arrows / WASD",
  "enter to select",
  "M mutes",
  "drag on touch",
] as const;

export const GameCabinet = () => {
  const { canvasRef, running } = useGame(apiScoresTransport);

  return (
    <main className="flex h-full touch-none flex-col items-center justify-center gap-[10px] overflow-hidden bg-[#0d1b2a] bg-[radial-gradient(circle_at_50%_0%,#1b3b5a_0%,#0d1b2a_60%,#060d16_100%)] font-mono text-[#ffd98a]">
      <h1 className="sr-only">slop for flip flop</h1>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        aria-label="slop for flip flop: guide a flip flop 75 km from Koh Samui to Koh Tao"
        className="max-h-[calc(100vh-70px)] max-w-[calc(100vw-20px)] rounded-[4px] border-[3px] border-[#2b1a10] bg-[#1a6ea8] shadow-[0_0_0_6px_#5a3a22,0_0_0_8px_#30200f,0_18px_50px_rgba(0,0,0,0.6)] [image-rendering:pixelated]"
      />
      <p className="px-[10px] text-center text-[10px] tracking-[0.5px] opacity-55 select-none sm:text-[11px]">
        {running
          ? HINTS.join("  ·  ")
          : "The 75 km crossing, from Koh Samui to Koh Tao."}
      </p>
    </main>
  );
};
