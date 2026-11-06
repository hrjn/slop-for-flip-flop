/**
 * Shared tropical palette. Keys are the single characters sprite art is authored with; `null` is
 * transparent. Sprites compile against this map, so an unknown character is a load-time error
 * rather than a silently missing pixel.
 */
export const PALETTE: Readonly<Record<string, string | null>> = {
  ".": null, // transparent

  // the hero: a black Mistral slide (claquette), seen from above
  "1": "#0a0c10", // outline / deepest black
  "2": "#15181e", // rubber band body
  "3": "#3d434f", // band gloss highlight
  "4": "#f2f5f8", // white mistral mark
  "5": "#262a33", // footbed
  "6": "#343945", // footbed highlight

  k: "#14161c", // legacy sole shadow / outline
  K: "#23262f", // legacy sole body
  L: "#363b48", // legacy sole highlight
  o: "#f06a16", // mistral orange
  O: "#ffa033", // orange highlight
  y: "#ffd34d", // logo yellow

  // water
  b: "#0d4f7c", // deep sea
  B: "#1a6ea8", // sea
  c: "#2f97cf", // shallow
  C: "#63c6ea", // crest
  w: "#bff0ff", // foam
  W: "#ffffff", // white foam

  // skin / surfers
  s: "#f0b27a", // light skin
  S: "#c87941", // mid skin
  t: "#8c5323", // dark skin
  r: "#e4443a", // boardshorts red
  R: "#ff7a5c", // boardshorts light
  g: "#2fbf71", // board green
  G: "#7cf0a8", // board light
  p: "#c84bc0", // board pink
  P: "#ff8de0", // board pink light

  // shark
  h: "#3b566b", // shark dark
  H: "#5a7c94", // shark body
  i: "#8fb0c4", // shark light
  I: "#e8f2f7", // shark belly
  x: "#ff4d4d", // blood / danger
  m: "#ffffff", // teeth

  // island / sand / palms
  n: "#f4e4b8", // sand light
  N: "#e0c489", // sand
  j: "#b9955c", // sand dark
  v: "#1f7a3d", // palm dark
  V: "#36a95b", // palm
  U: "#63d183", // palm light
  e: "#6b4423", // trunk
  E: "#8c5e33", // trunk light

  // ui / misc
  f: "#ffd98a", // ui sand text
  F: "#ff9f1c", // ui orange
  d: "#2b1a10", // ui dark
  z: "#ffe66d", // star / sun
  Z: "#fff3b0", // star light
  q: "#8a2be2", // jellyfish-ish accent
  Q: "#c08bff",
};
