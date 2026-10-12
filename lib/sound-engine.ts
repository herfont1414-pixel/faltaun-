// Música ambiente y sonidos cortos del menú online, generados con Web Audio.
// No usa archivos de audio: la pista es una composición propia (reggae / jazz
// lounge: acordes de jazz con "skank" a contratiempo, bajo redondo y batería
// "one drop") armada nota por nota, así que no hay derechos de terceros ni peso
// extra para descargar.
//
// Este archivo solo "arma" y "toca" las notas. El estado (prendido/apagado,
// volumen, preferencias) vive en lib/sound.ts.

export const BPM = 74;
export const BEAT = 60 / BPM;
export const BAR_SECONDS = BEAT * 4;

export type NoteKind = "keys" | "skank" | "bass" | "melody" | "hat" | "kick" | "rim";

export interface NoteEvent {
  kind: NoteKind;
  /** Segundos desde el inicio del compás. */
  at: number;
  /** Duración aproximada en segundos. */
  dur: number;
  /** Nota MIDI (solo para keys/skank/bass/melody). */
  midi?: number;
  /** Fuerza 0..1. */
  vel: number;
}

interface Chord {
  root: number; // MIDI de la fundamental (octava del bajo)
  minor: boolean; // tercera menor o mayor (para el bajo)
  voicing: number[]; // notas del acorde (sin fundamental), registro medio
}

const DM9: Chord = { root: 50, minor: true, voicing: [53, 57, 60, 64] };
const G13: Chord = { root: 43, minor: false, voicing: [53, 59, 62, 64] };
const CMAJ9: Chord = { root: 48, minor: false, voicing: [52, 55, 59, 62] };
const A7B9: Chord = { root: 45, minor: false, voicing: [55, 58, 61, 64] };

// Vamp de 8 compases: ii–V que gira como en el reggae y una vuelta jazzera al final.
export const PROGRESSION: Chord[] = [DM9, G13, DM9, G13, CMAJ9, A7B9, DM9, G13];

// Notas de la escala de Do mayor pentatónica, para la melodía esporádica (tipo melódica).
const MELODY_NOTES = [72, 74, 76, 79, 81, 79, 76];

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

// Un poco de "swing": el "y" de cada tiempo se retrasa.
const swung = (beat: number) => beat * BEAT + (beat % 1 ? BEAT * 0.1 : 0);

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
  const next = chordAt(barIndex + 1);
  const events: NoteEvent[] = [];

  // Colchón suave del piano eléctrico en el 1 (bajito, de fondo).
  chord.voicing.forEach((midi, i) => {
    events.push({ kind: "keys", at: i * 0.02, dur: BEAT * 3.6, midi, vel: 0.28 });
  });

  // Skank: acorde corto y seco en cada contratiempo (el "y" de cada tiempo).
  for (let beat = 0; beat < 4; beat++) {
    const at = swung(beat + 0.5);
    chord.voicing.slice(1).forEach((midi, i) => {
      events.push({ kind: "skank", at: at + i * 0.006, dur: 0.16, midi, vel: beat % 2 === 1 ? 0.6 : 0.45 });
    });
  }

  // Bajo redondo y sincopado: fundamental larga, repique, quinta, tercera y
  // una nota cromática que lleva al acorde siguiente.
  const r = foldBass(chord.root);
  const bassLine: Array<[number, number, number, number]> = [
    // [tiempo, nota, duración en tiempos, fuerza]
    [0, r, 1.3, 0.95],
    [1.5, r, 0.45, 0.7],
    [2.5, foldBass(chord.root + 7), 0.45, 0.75],
    [3, foldBass(chord.root + (chord.minor ? 3 : 4)), 0.45, 0.7],
    [3.5, foldBass(next.root) - 1, 0.5, 0.75],
  ];
  for (const [beat, midi, len, vel] of bassLine) {
    events.push({ kind: "bass", at: swung(beat), dur: BEAT * len, midi, vel });
  }

  // Batería "one drop": bombo y aro juntos en el 3, hi-hat en corcheas.
  for (let eighth = 0; eighth < 8; eighth++) {
    const beat = eighth / 2;
    events.push({ kind: "hat", at: swung(beat), dur: 0.05, vel: eighth % 2 ? 0.55 : 0.35 });
  }
  events.push({ kind: "kick", at: 2 * BEAT, dur: 0.4, vel: 0.9 });
  events.push({ kind: "rim", at: 2 * BEAT, dur: 0.08, vel: 0.8 });
  // Cada 4 compases, un golpecito de aro extra para cerrar la frase.
  if (barIndex % 4 === 3) events.push({ kind: "rim", at: swung(3.5), dur: 0.06, vel: 0.5 });

  // Melodía esporádica tipo melódica (a veces nada, así respira).
  if (rand() < 0.55) {
    const count = 1 + Math.floor(rand() * 3);
    let beat = 2 + (rand() < 0.5 ? 0 : 0.5);
    for (let i = 0; i < count && beat < 4; i++) {
      const midi = MELODY_NOTES[Math.floor(rand() * MELODY_NOTES.length)];
      events.push({ kind: "melody", at: swung(beat), dur: BEAT * 1.4, midi, vel: 0.4 });
      beat += rand() < 0.5 ? 1 : 1.5;
    }
  }

  return events.map((e) => ({ ...e, at: Math.max(0, e.at) })).sort((a, b) => a.at - b.at);
}

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

let noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
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
  lp.frequency.value = 300;
  out.connect(lp).connect(dest);
  envelope(out, t, 0.3 * e.vel, 0.012, e.dur);
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

function playSkank(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent) {
  // Golpe corto tipo guitarra/órgano apagado: diente de sierra filtrado y muy breve.
  const out = ctx.createGain();
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1400;
  bp.Q.value = 0.9;
  out.connect(bp).connect(dest);
  envelope(out, t, 0.06 * e.vel, 0.004, e.dur);
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = freq(e.midi!);
  osc.connect(out);
  osc.start(t);
  osc.stop(t + e.dur + 0.05);
}

function playMelodica(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent) {
  const out = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2200;
  out.connect(lp).connect(dest);
  envelope(out, t, 0.05 * e.vel, 0.03, e.dur);
  const f = freq(e.midi!);
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 5;
  lfoGain.gain.value = 5;
  lfo.connect(lfoGain);
  for (const [type, level] of [["triangle", 1], ["square", 0.18]] as const) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = f;
    g.gain.value = level;
    lfoGain.connect(osc.detune);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + e.dur + 0.1);
  }
  lfo.start(t);
  lfo.stop(t + e.dur + 0.1);
}

function playKick(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent) {
  const out = ctx.createGain();
  out.connect(dest);
  envelope(out, t, 0.32 * e.vel, 0.003, e.dur);
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(48, t + 0.18);
  osc.connect(out);
  osc.start(t);
  osc.stop(t + e.dur + 0.05);
}

function playRim(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent) {
  // Aro ("cross-stick"): clic de madera + un poquito de ruido.
  const out = ctx.createGain();
  out.connect(dest);
  envelope(out, t, 0.09 * e.vel, 0.002, e.dur);
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = 1750;
  osc.connect(out);
  osc.start(t);
  osc.stop(t + e.dur + 0.02);
  playNoise(ctx, dest, t, e, 2500, 2.5, 0.05);
}

/** Programa un compás completo para que empiece en el instante `t0` del contexto. */
export function scheduleBar(ctx: BaseAudioContext, dest: AudioNode, t0: number, barIndex: number, rand: () => number = Math.random) {
  for (const e of planBar(barIndex, rand)) {
    const t = t0 + e.at;
    if (e.kind === "keys") playKeys(ctx, dest, t, e);
    else if (e.kind === "skank") playSkank(ctx, dest, t, e);
    else if (e.kind === "bass") playBass(ctx, dest, t, e);
    else if (e.kind === "melody") playMelodica(ctx, dest, t, e);
    else if (e.kind === "kick") playKick(ctx, dest, t, e);
    else if (e.kind === "rim") playRim(ctx, dest, t, e);
    else playNoise(ctx, dest, t, e, 8000, 1.2, 0.04);
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
