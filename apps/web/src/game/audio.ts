/**
 * Tiny WebAudio chiptune engine: square-wave melody over a noise surf bed. Nothing is loaded from
 * disk — every sound is synthesised. The context is created on the first user gesture, which is
 * what browsers require, so this module is inert until `resume()` is called.
 */

type TrackName = "menu" | "game";

const NOTES: Readonly<Record<string, number>> = {
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880.0,
  B5: 987.77,
  C6: 1046.5,
};

interface Track {
  readonly bpm: number;
  readonly lead: readonly string[];
  readonly bass: readonly string[];
}

/** Laid-back island loops. `-` sustains, `.` rests. */
const TRACKS: Readonly<Record<TrackName, Track>> = {
  menu: {
    bpm: 104,
    lead: (
      "E5 . G5 . A5 - . G5 E5 . D5 . C5 - . . " +
      "D5 . E5 . G5 - . E5 D5 . C5 . A4 - . . "
    ).split(" "),
    bass: (
      "C3 . . . G3 . . . A3 . . . F3 . . . " +
      "C3 . . . G3 . . . F3 . . . G3 . . . "
    ).split(" "),
  },
  game: {
    bpm: 132,
    lead: (
      "C5 E5 G5 E5 A5 G5 E5 D5 C5 E5 G5 A5 G5 E5 D5 C5 " +
      "D5 F5 A5 F5 B5 A5 F5 E5 D5 F5 A5 B5 A5 F5 E5 D5"
    ).split(" "),
    bass: (
      "C3 . C3 . A3 . A3 . F3 . F3 . G3 . G3 . " +
      "C3 . C3 . A3 . A3 . F3 . F3 . G3 . G3 . "
    ).split(" "),
  },
};

const MASTER_GAIN = 0.55;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let surfSource: AudioBufferSourceNode | null = null;
let melodyTimer: ReturnType<typeof setInterval> | null = null;
let currentTrack: TrackName | null = null;
let step = 0;
let muted = false;

const ensure = (): AudioContext | null => {
  if (ctx) {
    return ctx;
  }

  if (typeof window === "undefined") {
    return null;
  }

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!Ctor) {
    return null;
  }

  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER_GAIN;
  master.connect(ctx.destination);

  musicGain = ctx.createGain();
  musicGain.gain.value = 0.3;
  musicGain.connect(master);

  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.55;
  sfxGain.connect(master);

  return ctx;
};

export const resume = (): void => {
  ensure();

  if (ctx && ctx.state === "suspended") {
    void ctx.resume();
  }
};

const tone = (
  freq: number,
  duration: number,
  type: OscillatorType = "square",
  gainValue = 0.2,
  destination: AudioNode | null = null,
  slideTo?: number
): void => {
  if (!ctx || muted) {
    return;
  }

  const dest = destination ?? sfxGain;

  if (!dest) {
    return;
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  if (slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, slideTo),
      now + duration
    );
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(dest);
  osc.start(now);
  osc.stop(now + duration + 0.03);
};

const noiseBuffer = (seconds: number): AudioBuffer => {
  const context = ctx as AudioContext;
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  return buffer;
};

const noise = (duration: number, gainValue = 0.25, filterFreq = 1400): void => {
  if (!ctx || muted || !sfxGain) {
    return;
  }

  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(Math.max(0.05, duration));

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterFreq;

  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(gainValue, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain);
  source.start(now);
  source.stop(now + duration + 0.02);
};

/** Continuous surf bed under the gameplay, breathing through a slow LFO on its gain. */
const startSurf = (): void => {
  if (!ensure() || surfSource || !ctx || !master) {
    return;
  }

  surfSource = ctx.createBufferSource();
  surfSource.buffer = noiseBuffer(3);
  surfSource.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 520;

  const gain = ctx.createGain();
  gain.gain.value = 0.07;

  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.18;
  lfoGain.gain.value = 0.045;
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  lfo.start();

  surfSource.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  surfSource.start();
};

const stopMelody = (): void => {
  if (melodyTimer) {
    clearInterval(melodyTimer);
    melodyTimer = null;
  }
};

const playTrack = (name: TrackName): void => {
  if (!ensure()) {
    return;
  }

  if (currentTrack === name && melodyTimer) {
    return;
  }

  currentTrack = name;
  stopMelody();

  const track = TRACKS[name];
  step = 0;
  const interval = 60000 / track.bpm / 2; // eighth notes

  melodyTimer = setInterval(() => {
    if (muted || !ctx) {
      return;
    }

    const index = step % track.lead.length;
    const lead = track.lead[index];
    const bass = track.bass[index % track.bass.length];

    if (lead && lead !== "." && lead !== "-" && NOTES[lead] !== undefined) {
      tone(NOTES[lead], (interval / 1000) * 1.6, "square", 0.16, musicGain);
    }

    if (bass && bass !== "." && NOTES[bass] !== undefined) {
      tone(NOTES[bass], (interval / 1000) * 1.9, "triangle", 0.22, musicGain);
    }

    step++;
  }, interval);
};

const arpeggio = (
  notes: readonly string[],
  spacingMs: number,
  duration: number,
  type: OscillatorType,
  gainValue: number
): void => {
  notes.forEach((note, index) => {
    setTimeout(() => {
      const freq = NOTES[note];

      if (freq !== undefined) {
        tone(freq, duration, type, gainValue);
      }
    }, index * spacingMs);
  });
};

export const Sound = {
  init: (): void => {
    ensure();
  },
  resume,
  music: (name: TrackName): void => {
    resume();
    playTrack(name);
  },
  stopMusic: (): void => {
    stopMelody();
    currentTrack = null;
  },
  surf: (): void => {
    resume();
    startSurf();
  },
  isMuted: (): boolean => muted,
  toggleMute: (): boolean => {
    muted = !muted;

    if (master) {
      master.gain.value = muted ? 0 : MASTER_GAIN;
    }

    return muted;
  },

  pickup: (): void => {
    tone(NOTES.E5 as number, 0.07, "square", 0.22);
    setTimeout(() => tone(NOTES.B5 as number, 0.1, "square", 0.2), 60);
  },
  star: (): void => arpeggio(["C5", "E5", "G5", "C6"], 55, 0.12, "square", 0.2),
  hit: (): void => {
    noise(0.35, 0.4, 900);
    tone(220, 0.35, "sawtooth", 0.25, null, 60);
  },
  splash: (): void => {
    noise(0.28, 0.3, 2200);
  },
  select: (): void => {
    tone(NOTES.A4 as number, 0.06, "square", 0.2);
  },
  confirm: (): void => {
    tone(NOTES.C5 as number, 0.07, "square", 0.22);
    setTimeout(() => tone(NOTES.G5 as number, 0.12, "square", 0.2), 65);
  },
  gameover: (): void =>
    arpeggio(["G4", "E4", "D4", "C4"], 190, 0.3, "triangle", 0.25),
  victory: (): void =>
    arpeggio(["C5", "E5", "G5", "C6", "G5", "C6"], 150, 0.22, "square", 0.22),
};
