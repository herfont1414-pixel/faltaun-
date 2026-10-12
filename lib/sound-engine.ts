// Música ambiente y sonidos cortos del menú online, generados con Web Audio.
// No usa archivos de audio: la pista es una composición propia estilo bossa
// nova lounge (guitarra de nylon con el ritmo de la bossa, bajo, shaker y una
// flauta de vez en cuando) armada nota por nota, así que no hay derechos de
// terceros ni peso extra para descargar.
//
// Este archivo solo "arma" y "toca" las notas. El estado (prendido/apagado,
// volumen, preferencias) vive en lib/sound.ts.

export const BPM = 126;
export const BEAT = 60 / BPM;
export const BAR_SECONDS = BEAT * 4;
const EIGHTH = BEAT / 2;

export type NoteKind = "keys" | "guitar" | "bass" | "melody" | "shaker" | "rim" | "kick";

export interface NoteEvent {
  kind: NoteKind;
  /** Segundos desde el inicio del compás. */
  at: number;
  /** Duración aproximada en segundos. */
  dur: number;
  /** Nota MIDI (solo para keys/guitar/bass/melody). */
  midi?: number;
  /** Fuerza 0..1. */
  vel: number;
}

interface Chord {
  root: number; // MIDI de la fundamental (octava del bajo)
  voicing: number[]; // notas del acorde para la guitarra (sin fundamental)
}

const CMAJ9: Chord = { root: 48, voicing: [52, 55, 59, 62] };
const AM9: Chord = { root: 45, voicing: [55, 59, 60, 64] };
const DM9: Chord = { root: 50, voicing: [53, 57, 60, 64] };
const G13: Chord = { root: 43, voicing: [53, 59, 62, 64] };
const FMAJ7: Chord = { root: 41, voicing: [52, 57, 60, 64] };
const E7B9: Chord = { root: 40, voicing: [50, 53, 56, 62] };

// 16 compases, cada acorde dura dos (como en la bossa, sin apuro).
export const PROGRESSION: Chord[] = [
  CMAJ9, CMAJ9, AM9, AM9, DM9, DM9, G13, G13,
  CMAJ9, CMAJ9, FMAJ7, FMAJ7, E7B9, E7B9, DM9, G13,
];

// Ritmo de la guitarra: la "clave" de la bossa en corcheas sobre dos compases
// (3 + 3 + 4 + 3 + 3). Compás par: corcheas 0, 3 y 6; compás impar: 2 y 5.
export const GUITAR_EIGHTHS: [number[], number[]] = [[0, 3, 6], [2, 5]];

// Bajo de bossa: fundamental en el 1, quinta en el "y" del 2 que se liga al 3,
// y otra vez quinta/fundamental en el "y" del 4.
export const BASS_BEATS = [0, 1.5, 2, 3.5];

// Notas de Do mayor pentatónica, para la flauta esporádica.
const MELODY_NOTES = [72, 74, 76, 79, 81, 79, 76, 74];

/** Generador pseudoaleatorio determinístico (para poder testear). */
export function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function foldBass(midi: number) {
  let n = midi;
  while (n < 38) n += 12;
  while (n > 52) n -= 12;
  return n;
}

const chordAt = (barIndex: number) => {
  const n = PROGRESSION.length;
  return PROGRESSION[((barIndex % n) + n) % n];
};

/** Qué notas suenan en un compás de la progresión. Función pura. */
export function planBar(barIndex: number, rand: () => number = Math.random): NoteEvent[] {
  const chord = chordAt(barIndex);
  const prev = chordAt(barIndex - 1);
  const evenBar = ((barIndex % 2) + 2) % 2 === 0;
  const events: NoteEvent[] = [];

  // Colchón muy suave de piano eléctrico cuando cambia el acorde.
  if (chord !== prev) {
    chord.voicing.forEach((midi, i) => {
      events.push({ kind: "keys", at: i * 0.02, dur: BAR_SECONDS * 1.8, midi: midi + 12, vel: 0.18 });
    });
  }

  // Guitarra de nylon: acorde rasgueado suave con los dedos (arpegio cortito).
  const hits = GUITAR_EIGHTHS[evenBar ? 0 : 1];
  hits.forEach((eighth, h) => {
    const last = h === hits.length - 1;
    chord.voicing.forEach((midi, i) => {
      events.push({
        kind: "guitar",
        at: eighth * EIGHTH + i * 0.012,
        dur: last ? EIGHTH * 3.5 : EIGHTH * 2.6,
        midi,
        vel: eighth === 0 ? 0.75 : 0.62,
      });
    });
  });

  // Bajo: fundamental y quinta.
  const root = foldBass(chord.root);
  const fifth = foldBass(chord.root + 7);
  const bassNotes = [root, fifth, fifth, evenBar ? root : fifth];
  BASS_BEATS.forEach((beat, i) => {
    events.push({ kind: "bass", at: beat * BEAT, dur: i === 0 ? BEAT * 1.4 : BEAT * 0.45, midi: bassNotes[i], vel: i === 0 ? 0.9 : 0.65 });
  });

  // Percusión: shaker en corcheas (acento en los "y"), aro siguiendo la clave y
  // un bombo muy suave en el 1 y el 3.
  for (let eighth = 0; eighth < 8; eighth++) {
    events.push({ kind: "shaker", at: eighth * EIGHTH, dur: 0.06, vel: eighth % 2 ? 0.55 : 0.32 });
  }
  hits.forEach((eighth) => events.push({ kind: "rim", at: eighth * EIGHTH, dur: 0.05, vel: 0.45 }));
  events.push({ kind: "kick", at: 0, dur: 0.3, vel: 0.55 });
  events.push({ kind: "kick", at: 2 * BEAT, dur: 0.3, vel: 0.45 });

  // Flauta de vez en cuando, en frases cortitas que arrancan en compases pares.
  if (evenBar && rand() < 0.5) {
    const count = 2 + Math.floor(rand() * 3);
    let eighth = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < count && eighth < 8; i++) {
      const midi = MELODY_NOTES[Math.floor(rand() * MELODY_NOTES.length)];
      const len = rand() < 0.5 ? 2 : 3;
      events.push({ kind: "melody", at: eighth * EIGHTH, dur: EIGHTH * len * 1.2, midi, vel: 0.45 });
      eighth += len;
    }
  }

  return events.sort((a, b) => a.at - b.at);
}

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ctx: BaseAudioContext) {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = buf.getChannelData(0);
    const rand = seededRandom(7);
    for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

/** Reverb corto y suave, generado (sin archivo de respuesta al impulso). */
export function makeReverb(ctx: BaseAudioContext, seconds = 2.2) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  const rand = seededRandom(11);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (rand() * 2 - 1) * Math.pow(1 - i / length, 2.6);
  }
  const conv = ctx.createConvolver();
  conv.buffer = impulse;
  return conv;
}

function envelope(g: GainNode, t: number, peak: number, attack: number, dur: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.02));
}

function playKeys(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent) {
  const f = freq(e.midi!);
  const out = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1900;
  out.connect(lp).connect(dest);
  envelope(out, t, 0.09 * e.vel, 0.012, e.dur);
  // Piano eléctrico tipo Rhodes: fundamental + octava suave + "campanita" que se apaga rápido.
  for (const [mult, level, detune] of [[1, 1, 0], [2, 0.28, 3], [4.01, 0.08, -2]] as const) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = f * mult;
    osc.detune.value = detune;
    g.gain.value = level;
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + e.dur + 0.1);
  }
}

function playBass(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent) {
  const out = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 380;
  out.connect(lp).connect(dest);
  envelope(out, t, 0.26 * e.vel, 0.012, e.dur);
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq(e.midi!);
  osc.connect(out);
  osc.start(t);
  osc.stop(t + e.dur + 0.1);
}

function playNoise(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent, hz: number, q: number, level: number) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = hz;
  bp.Q.value = q;
  const g = ctx.createGain();
  envelope(g, t, level * e.vel, 0.004, e.dur);
  src.connect(bp).connect(g).connect(dest);
  src.start(t, Math.random() * 0.2);
  src.stop(t + e.dur + 0.05);
}

// Guitarra de nylon por síntesis de cuerda pulsada (Karplus–Strong). Se
// calcula una vez por nota y se reutiliza.
const pluckCache = new WeakMap<BaseAudioContext, Map<number, { buffer: AudioBuffer; rate: number }>>();
function pluck(ctx: BaseAudioContext, midi: number) {
  let byNote = pluckCache.get(ctx);
  if (!byNote) {
    byNote = new Map();
    pluckCache.set(ctx, byNote);
  }
  const hit = byNote.get(midi);
  if (hit) return hit;
  const sr = ctx.sampleRate;
  const f = freq(midi);
  const period = Math.max(2, Math.round(sr / f - 0.5));
  const buffer = ctx.createBuffer(1, Math.floor(sr * 1.6), sr);
  const data = buffer.getChannelData(0);
  const rand = seededRandom(midi * 31 + 5);
  // Excitación suave (ruido filtrado): da el ataque redondo de la cuerda de nylon.
  let prev = 0;
  for (let i = 0; i < period; i++) {
    const n = rand() * 2 - 1;
    prev = prev * 0.6 + n * 0.4;
    data[i] = prev;
  }
  const decay = 0.9965;
  for (let i = period; i < data.length; i++) {
    data[i] = decay * 0.5 * (data[i - period] + data[i - period - 1 >= 0 ? i - period - 1 : 0]);
  }
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 0) for (let i = 0; i < data.length; i++) data[i] /= peak;
  // El promedio de dos muestras agrega media muestra de retardo: se corrige la afinación.
  const entry = { buffer, rate: ((period + 0.5) * f) / sr };
  byNote.set(midi, entry);
  return entry;
}

function playGuitar(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent) {
  const { buffer, rate } = pluck(ctx, e.midi!);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2600;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.075 * e.vel, t);
  // Se apaga con la mano (como el "muteado" de la bossa) al terminar la nota.
  g.gain.setTargetAtTime(0.0001, t + e.dur, 0.06);
  src.connect(lp).connect(g).connect(dest);
  src.start(t);
  src.stop(t + e.dur + 0.4);
}

function playFlute(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent) {
  const out = ctx.createGain();
  out.connect(dest);
  envelope(out, t, 0.055 * e.vel, 0.06, e.dur);
  const f = freq(e.midi!);
  // Vibrato que entra de a poco.
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 5.2;
  lfoGain.gain.setValueAtTime(0, t);
  lfoGain.gain.linearRampToValueAtTime(7, t + 0.25);
  lfo.connect(lfoGain);
  for (const [type, mult, level] of [["sine", 1, 1], ["triangle", 2, 0.08]] as const) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = f * mult;
    g.gain.value = level;
    lfoGain.connect(osc.detune);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + e.dur + 0.1);
  }
  lfo.start(t);
  lfo.stop(t + e.dur + 0.1);
  // Un soplido apenas audible al principio de la nota.
  playNoise(ctx, dest, t, { ...e, dur: 0.12, vel: e.vel }, f * 2, 2, 0.02);
}

function playKick(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent) {
  const out = ctx.createGain();
  out.connect(dest);
  envelope(out, t, 0.22 * e.vel, 0.003, e.dur);
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(95, t);
  osc.frequency.exponentialRampToValueAtTime(50, t + 0.15);
  osc.connect(out);
  osc.start(t);
  osc.stop(t + e.dur + 0.05);
}

function playRim(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent) {
  // Aro ("cross-stick") suave: clic de madera.
  const out = ctx.createGain();
  out.connect(dest);
  envelope(out, t, 0.05 * e.vel, 0.002, e.dur);
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = 1900;
  osc.connect(out);
  osc.start(t);
  osc.stop(t + e.dur + 0.02);
}

/** Programa un compás completo para que empiece en el instante `t0` del contexto. */
export function scheduleBar(ctx: BaseAudioContext, dest: AudioNode, t0: number, barIndex: number, rand: () => number = Math.random) {
  for (const e of planBar(barIndex, rand)) {
    const t = t0 + e.at;
    if (e.kind === "keys") playKeys(ctx, dest, t, e);
    else if (e.kind === "guitar") playGuitar(ctx, dest, t, e);
    else if (e.kind === "bass") playBass(ctx, dest, t, e);
    else if (e.kind === "melody") playFlute(ctx, dest, t, e);
    else if (e.kind === "kick") playKick(ctx, dest, t, e);
    else if (e.kind === "rim") playRim(ctx, dest, t, e);
    else playNoise(ctx, dest, t, e, 6500, 1.4, 0.035);
  }
}

function bell(ctx: BaseAudioContext, dest: AudioNode, t: number, hz: number, dur: number, peak: number) {
  const out = ctx.createGain();
  out.connect(dest);
  envelope(out, t, peak, 0.006, dur);
  for (const [mult, level] of [[1, 1], [2.76, 0.18], [5.4, 0.05]] as const) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = hz * mult;
    g.gain.value = level;
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}

/** "Plop" suave al agregar un producto al carrito. */
export function playAddSound(ctx: BaseAudioContext, dest: AudioNode, t = ctx.currentTime) {
  const out = ctx.createGain();
  out.connect(dest);
  envelope(out, t, 0.4, 0.005, 0.16);
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(520, t);
  osc.frequency.exponentialRampToValueAtTime(980, t + 0.09);
  osc.connect(out);
  osc.start(t);
  osc.stop(t + 0.2);
  bell(ctx, dest, t + 0.07, 1318.5, 0.28, 0.12);
}

/** Campanita ascendente al enviar el pedido. */
export function playSentSound(ctx: BaseAudioContext, dest: AudioNode, t = ctx.currentTime) {
  [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => {
    bell(ctx, dest, t + i * 0.11, hz, i === 3 ? 1.2 : 0.55, 0.28);
  });
}
