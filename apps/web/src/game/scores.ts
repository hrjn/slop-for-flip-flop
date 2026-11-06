/**
 * The high score board.
 *
 * The game draws the table every frame, so reads are synchronous against an in-memory list. That
 * list is refreshed from, and written through to, an optional transport (the API). Whatever the
 * transport does, the board also mirrors itself into `localStorage`, so a run offline, or against
 * an API that is down, still keeps its scores on this machine.
 */

export interface ScoreEntry {
  readonly name: string;
  readonly score: number;
  readonly km: number;
}

/** Where the board is persisted beyond this browser. Rejections are expected and swallowed. */
export interface ScoresTransport {
  list(): Promise<readonly ScoreEntry[]>;
  submit(entry: ScoreEntry): Promise<readonly ScoreEntry[]>;
}

export const MAX_SCORES = 8;

const STORAGE_KEY = "slop-for-flip-flop.scores.v1";

/** Shown on a board nobody has written to yet, so the table is never empty. */
export const SEED: readonly ScoreEntry[] = [
  { name: "EMM", score: 7500, km: 75 },
  { name: "TIM", score: 5200, km: 52 },
  { name: "AUR", score: 3800, km: 38 },
  { name: "JUL", score: 2600, km: 26 },
  { name: "OCT", score: 1700, km: 17 },
  { name: "VIC", score: 1100, km: 11 },
  { name: "COR", score: 700, km: 7 },
  { name: "BOT", score: 300, km: 3 },
];

export const normalizeName = (name: unknown): string =>
  String(name ?? "AAA")
    .slice(0, 3)
    .toUpperCase()
    .trim() || "AAA";

const normalize = (entry: {
  name?: unknown;
  score?: unknown;
  km?: unknown;
}): ScoreEntry => ({
  name: normalizeName(entry.name),
  score: Math.max(0, Math.floor(Number(entry.score) || 0)),
  km: Math.max(0, Math.round(Number(entry.km) || 0)),
});

const rank = (entries: readonly ScoreEntry[]): ScoreEntry[] =>
  [...entries].sort((a, b) => b.score - a.score).slice(0, MAX_SCORES);

const storage = (): Storage | null => {
  try {
    const probe = "__sfff_probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);

    return window.localStorage;
  } catch {
    return null;
  }
};

const readStored = (): ScoreEntry[] | null => {
  const store = storage();

  if (!store) {
    return null;
  }

  try {
    const raw = store.getItem(STORAGE_KEY);

    if (raw === null) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return null;
    }

    const entries = parsed
      .filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null
      )
      .map(normalize);

    return entries.length > 0 ? rank(entries) : null;
  } catch {
    return null;
  }
};

const writeStored = (entries: readonly ScoreEntry[]): void => {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // A full or blocked store is not worth failing a run over.
  }
};

export class ScoreBoard {
  private entries: ScoreEntry[];
  private listeners = new Set<() => void>();

  constructor(private readonly transport?: ScoresTransport) {
    this.entries = readStored() ?? [...SEED];
  }

  /** The current table, best first. Synchronous: the renderer calls it every frame. */
  load(): readonly ScoreEntry[] {
    return this.entries;
  }

  /** Notifies on every change, so React can mirror the board outside the canvas. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private set(entries: readonly ScoreEntry[]): void {
    this.entries = rank(entries);
    writeStored(this.entries);

    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Pull the shared board. Leaves the local one in place when the API cannot be reached. */
  async refresh(): Promise<void> {
    if (!this.transport) {
      return;
    }

    try {
      const remote = await this.transport.list();

      if (remote.length > 0) {
        this.set(remote.map(normalize));
      }
    } catch {
      // Offline, or the API is down: the local board stands.
    }
  }

  /** Whether a score makes the table at all — what decides if the name entry screen appears. */
  qualifies(score: number): boolean {
    if (score <= 0) {
      return false;
    }

    if (this.entries.length < MAX_SCORES) {
      return true;
    }

    return score > (this.entries[this.entries.length - 1] as ScoreEntry).score;
  }

  /** 1-based position a score would take, or -1 when it would not make the table. */
  rankOf(score: number): number {
    const index = this.entries.findIndex((entry) => score > entry.score);

    if (index >= 0) {
      return index + 1;
    }

    return this.entries.length < MAX_SCORES ? this.entries.length + 1 : -1;
  }

  /**
   * Record a run. The local table updates immediately so the board is right on the next frame;
   * the server's answer replaces it when it arrives.
   */
  submit(name: string, score: number, km: number): readonly ScoreEntry[] {
    const entry = normalize({ name, score, km });
    this.set([...this.entries, entry]);

    if (this.transport) {
      void this.transport
        .submit(entry)
        .then((remote) => {
          if (remote.length > 0) {
            this.set(remote.map(normalize));
          }
        })
        .catch(() => {
          // The run is already on the local board; nothing else to do.
        });
    }

    return this.entries;
  }

  /** Back to the seed table. Used by the dev harness, not by the game. */
  reset(): void {
    this.set([...SEED]);
  }
}
