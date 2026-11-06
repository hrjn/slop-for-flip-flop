import { createFileRoute, redirect } from "@tanstack/react-router";

import { GameCabinet } from "../game/game-cabinet";

/**
 * The arcade cabinet, served at `/`. The landing guard the scaffold ships stays: a capability that
 * claims `/` still wins, and the game is simply what `/` shows when nothing else claims it.
 *
 * The canvas renders nothing on the server: the engine draws from an animation frame, which only
 * the browser has. The markup around it is identical on both sides, so hydration is quiet.
 */
export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    const to = context.landingPath();

    if (to !== undefined && to !== "" && to !== "/") {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's redirect is thrown, by design
      throw redirect({ href: to });
    }
  },
  component: GameCabinet,
  head: () => ({
    meta: [
      {
        name: "description",
        content:
          "A pixel-art arcade game: guide a lost Mistral claquette 75 km across the Gulf of Thailand, from Koh Samui to Koh Tao.",
      },
      // The canvas is scaled to whole pixels against the viewport, so the page never zooms.
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1.0, user-scalable=no",
      },
    ],
  }),
});
