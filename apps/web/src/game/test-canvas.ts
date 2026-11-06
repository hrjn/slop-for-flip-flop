/**
 * A recording 2D context, so the game can be driven headlessly.
 *
 * jsdom has no canvas, so `getContext("2d")` returns null there. This stand-in records what was
 * drawn and refuses a non-finite coordinate: a NaN that slips into the simulation shows up as a
 * drawing call rather than as a blank screen nobody notices.
 */

export interface RecordingContext {
  /** How many `fillRect` calls the frame made. */
  rects: number;
  /** Every distinct `fillStyle` the frame used. */
  colors: Set<string>;
}

const finite = (label: string, ...values: number[]): void => {
  if (!values.every((value) => Number.isFinite(value))) {
    throw new Error(`non-finite ${label}: ${values.join(",")}`);
  }
};

export const recordingContext = (): CanvasRenderingContext2D & {
  readonly recorded: RecordingContext;
} => {
  const recorded: RecordingContext = { rects: 0, colors: new Set() };
  let fill = "";

  const context = {
    recorded,
    imageSmoothingEnabled: false,
    globalAlpha: 1,

    get fillStyle(): string {
      return fill;
    },

    set fillStyle(value: string) {
      fill = String(value);
      recorded.colors.add(fill);
    },

    fillRect(x: number, y: number, w: number, h: number): void {
      finite("fillRect", x, y, w, h);
      recorded.rects++;
    },

    clearRect: (): void => {},
    save: (): void => {},
    restore: (): void => {},

    translate(x: number, y: number): void {
      finite("translate", x, y);
    },

    scale: (): void => {},

    rotate(angle: number): void {
      finite("rotate", angle);
    },

    createLinearGradient: () => ({ addColorStop: (): void => {} }),
  };

  // The engine uses this handful of calls; the cast keeps the stub to them.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a deliberate partial stand-in for the parts of the 2D context the engine calls
  return context as unknown as CanvasRenderingContext2D & {
    readonly recorded: RecordingContext;
  };
};

/** A canvas whose `getContext("2d")` answers with a fresh recording context. */
export const recordingCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 320;
  // `getContext` is overloaded over every context id; this stand-in answers only the 2D one, which
  // is all the engine asks for.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
  canvas.getContext = (() =>
    recordingContext()) as unknown as HTMLCanvasElement["getContext"];

  return canvas;
};
