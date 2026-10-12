// Música ambiente y sonidos cortos del menú online, generados con Web Audio.
// No usa archivos de audio: la pista es una composición propia estilo "reggae
// café" vintage (acordes pop, ritmo one drop, guitarra a contratiempo, órgano
// "bubble", bajo de dub y una melodía de melódica que se repite) armada nota
// por nota, así que no hay derechos de terceros ni peso extra para descargar.
//
// Este archivo solo "arma" y "toca" las notas. El estado (prendido/apagado,
// volumen, preferencias) vive en lib/sound.ts.

export const BPM = 76;
export const BEAT = 60 / BPM;
export const BAR_SECONDS = BEAT * 4;
const EIGHTH = BEAT / 2;

export type NoteKind =
  | "keys"
  | "skank"
  | "organ"
  | "bass"
  | "melody"
  | "hat"
  | "kick"
  | "rim"
  | "tom"
  | "crackle";

export interface NoteEvent {
  kind: NoteKind;
  /** Segundos desde el inicio del compás. */
  at: number;
  /** Duración aproximada en segundos. */
  dur: number;
  /** Nota MIDI (solo para instrumentos con altura). */
  midi?: number;
  /** Fuerza 0..1. */
  vel: number;
}

interface Chord {
  root: number; // MIDI de la fundamental (octava del bajo)
  minor: boolean;
  triad: number[]; // acorde para guitarra/órgano, registro medio
}

// Acordes pop de toda la vida (vi–IV–I–V en Do): La menor, Fa, Do, Sol.
const AM: Chord = { root: 45, minor: true, triad: [57, 60, 64] };
const F: Chord = { root: 41, minor: false, triad: [57, 60, 65] };
const C: Chord = { root: 48, minor: false, triad: [55, 60, 64] };
const G: Chord = { root: 43, minor: false, triad: [55, 59, 62] };

// 16 compases: 4 de groove, 4 con la melodía, 4 de groove con algún adorno y
// 4 con la melodía otra vez. Después vuelve a empezar.
export const PROGRESSION: Chord[] = Array.from({ length: 16 }, (_, i) => [AM, F, C, G][i % 4]);

// Compases (dentro de la vuelta de 16) donde suena la melodía principal.
export const HOOK_BARS = [4, 5, 6, 7, 12, 13, 14, 15];

// Melodía principal (el "gancho"), uno por acorde: [corchea, nota MIDI, largo en corcheas].
const HOOK: Array<Array<[number, number, number]>> = [
  [[1, 76, 2], [3, 74, 1], [4, 72, 3]], // La menor: mi – re – do
  [[1, 69, 2], [3, 72, 1], [4, 69, 3]], // Fa: la – do – la
  [[1, 76, 2], [3, 79, 1], [4, 76, 2], [6, 74, 2]], // Do: mi – sol – mi – re
  [[1, 74, 2], [3, 71, 1], [4, 67, 4]], // Sol: re – si – sol
];

// Notas de La menor pentatónica, para algún adorno suelto entre vueltas.
const LICK_NOTES = [69, 72, 74, 76, 79];

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

const mod = (n: number, m: number) => ((n % m) + m) % m;

// Un poco de "swing": el "y" de cada tiempo se retrasa (groove relajado).
const sw = (beat: number) => beat * BEAT + (mod(beat, 1) === 0.5 ? BEAT * 0.12 : 0);

/** Qué notas suenan en un compás de la vuelta. Función pura. */
export function planBar(barIndex: number, rand: () => number = Math.random): NoteEvent[] {
  const bar = mod(barIndex, PROGRESSION.length);
  const chord = PROGRESSION[bar];
  const events: NoteEvent[] = [];

  // Piano eléctrico muy bajito de fondo, al empezar cada acorde.
  chord.triad.forEach((midi, i) => {
    events.push({ kind: "keys", at: i * 0.02, dur: BAR_SECONDS * 0.9, midi, vel: 0.2 });
  });

  // Guitarra "skank": el chack seco en los tiempos 2 y 4.
  for (const beat of [1, 3]) {
    chord.triad.forEach((midi, i) => {
      events.push({ kind: "skank", at: beat * BEAT + i * 0.005, dur: 0.11, midi: midi + 12, vel: 0.8 });
    });
  }

  // Órgano "bubble": acordes cortitos en el "y" de cada tiempo, más suaves.
  for (let beat = 0; beat < 4; beat++) {
    chord.triad.forEach((midi) => {
      events.push({ kind: "organ", at: sw(beat + 0.5), dur: 0.14, midi, vel: beat % 2 ? 0.5 : 0.65 });
    });
  }

  // Bajo de dub: redondo y con espacios; termina subiendo hacia el próximo acorde.
  const r = chord.root;
  const third = r + (chord.minor ? 3 : 4);
  const line: Array<[number, number, number, number]> = [
    // [tiempo, nota, duración en tiempos, fuerza]
    [0, r, 1.2, 0.95],
    [1.5, r, 0.4, 0.7],
    [2, r + 7, 0.45, 0.8],
    [2.5, third, 0.4, 0.7],
    [3, r + 7, 0.9, 0.8],
  ];
  for (const [beat, midi, len, vel] of line) {
    events.push({ kind: "bass", at: sw(beat), dur: BEAT * len, midi, vel });
  }

  // Batería one drop: bombo y aro juntos en el 3, hi-hat en corcheas con swing.
  for (let eighth = 0; eighth < 8; eighth++) {
    events.push({ kind: "hat", at: sw(eighth / 2), dur: 0.05, vel: eighth % 2 ? 0.6 : 0.35 });
  }
  events.push({ kind: "kick", at: 2 * BEAT, dur: 0.45, vel: 0.95 });
  events.push({ kind: "rim", at: 2 * BEAT, dur: 0.07, vel: 0.85 });
  // Al final de cada frase de 4 compases, un redoble cortito de tambor.
  if (bar % 4 === 3) {
    [3, 3.25, 3.5, 3.75].forEach((beat, i) => {
      events.push({ kind: "tom", at: beat * BEAT, dur: 0.25, midi: 50 - i * 2, vel: 0.5 + i * 0.1 });
    });
  }

  // Melodía de melódica: el gancho en los compases que corresponde; en el resto,
  // de vez en cuando un adorno suelto.
  if (HOOK_BARS.includes(bar)) {
    for (const [eighth, midi, len] of HOOK[bar % 4]) {
      events.push({ kind: "melody", at: sw(eighth / 2), dur: EIGHTH * len * 1.1, midi, vel: 0.6 });
    }
  } else if (bar >= 8 && rand() < 0.4) {
    const midi = LICK_NOTES[Math.floor(rand() * LICK_NOTES.length)];
    events.push({ kind: "melody", at: sw(2.5), dur: EIGHTH * 3, midi, vel: 0.4 });
  }

  // Crujido de vinilo, apenas audible, para el toque vintage.
  const pops = 2 + Math.floor(rand() * 4);
  for (let i = 0; i < pops; i++) {
    events.push({ kind: "crackle", at: rand() * (BAR_SECONDS - 0.05), dur: 0.01, vel: 0.3 + rand() * 0.5 });
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

/**
 * Color "vintage" para la música: una saturación suave (como cinta) y un
 * poquito menos de agudos. Devuelve la entrada y la salida de la cadena.
 */
export function makeVintageChain(ctx: BaseAudioContext) {
  const input = ctx.createGain();
  // La curva amplifica ~1,75x las señales chicas: se compensa para no subir el volumen.
  input.gain.value = 0.57;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(1.6 * x) / Math.tanh(1.6);
  }
  shaper.curve = curve;
  shaper.oversample = "2x";
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 6500;
  tone.Q.value = 0.5;
  input.connect(shaper).connect(tone);
  return { input, output: tone };
}

function envelope(g: GainNode, t: number, peak: number, attack: number, dur: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.02));
}

function tone(
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
  dur: number,
  partials: ReadonlyArray<readonly [OscillatorType, number, number]>,
  baseHz: number
) {
  for (const [type, mult, level] of partials) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = baseHz * mult;
    g.gain.value = level;
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }
}

function playKeys(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent) {
  const out = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1800;
  out.connect(lp).connect(dest);
  envelope(out, t, 0.09 * e.vel, 0.012, e.dur);
  // Piano eléctrico tipo Rhodes.
  tone(ctx, out, t, e.dur, [["sine", 1, 1], ["sine", 2, 0.28], ["sine", 4.01, 0.06]], freq(e.midi!));
}

function playSkank(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent) {
  // Guitarra eléctrica limpia, apagada con la mano: diente de sierra filtrado y muy corto.
  const out = ctx.createGain();
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1500;
  bp.Q.value = 0.8;
  out.connect(bp).connect(dest);
  envelope(out, t, 0.07 * e.vel, 0.003, e.dur);
  tone(ctx, out, t, e.dur, [["sawtooth", 1, 1], ["square", 1.003, 0.3]], freq(e.midi!));
}

function playOrgan(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent) {
  // Órgano de registros (8', 4' y 2 2/3'), con ataque rápido.
  const out = ctx.createGain();
  out.connect(dest);
  envelope(out, t, 0.035 * e.vel, 0.006, e.dur);
  tone(ctx, out, t, e.dur, [["sine", 1, 1], ["sine", 2, 0.6], ["sine", 3, 0.35]], freq(e.midi!));
}

function playBass(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent) {
  // Bajo de dub: grave y redondo, con un poquito de armónico para que se oiga
  // también en el parlante del celular.
  const out = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 360;
  out.connect(lp).connect(dest);
  envelope(out, t, 0.3 * e.vel, 0.012, e.dur);
  tone(ctx, out, t, e.dur, [["sine", 1, 1], ["triangle", 2, 0.35]], freq(e.midi!));
}

function playMelodica(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent) {
  const out = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2400;
  out.connect(lp).connect(dest);
  envelope(out, t, 0.05 * e.vel, 0.035, e.dur);
  const f = freq(e.midi!);
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 5;
  lfoGain.gain.setValueAtTime(0, t);
  lfoGain.gain.linearRampToValueAtTime(6, t + 0.2);
  lfo.connect(lfoGain);
  for (const [type, level] of [["triangle", 1], ["square", 0.22]] as const) {
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

function playNoise(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent, hz: number, q: number, level: number) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = hz;
  bp.Q.value = q;
  const g = ctx.createGain();
  envelope(g, t, level * e.vel, 0.003, e.dur);
  src.connect(bp).connect(g).connect(dest);
  src.start(t, Math.random() * 0.2);
  src.stop(t + e.dur + 0.05);
}

function playKick(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent) {
  const out = ctx.createGain();
  out.connect(dest);
  envelope(out, t, 0.34 * e.vel, 0.003, e.dur);
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(105, t);
  osc.frequency.exponentialRampToValueAtTime(46, t + 0.2);
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

function playTom(ctx: BaseAudioContext, dest: AudioNode, t: number, e: NoteEvent) {
  const out = ctx.createGain();
  out.connect(dest);
  envelope(out, t, 0.16 * e.vel, 0.003, e.dur);
  const osc = ctx.createOscillator();
  osc.type = "sine";
  const f = freq(e.midi!);
  osc.frequency.setValueAtTime(f * 1.5, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.08);
  osc.connect(out);
  osc.start(t);
  osc.stop(t + e.dur + 0.05);
  playNoise(ctx, dest, t, { ...e, dur: 0.06 }, 1200, 1, 0.04);
}

/** Programa un compás completo para que empiece en el instante `t0` del contexto. */
export function scheduleBar(ctx: BaseAudioContext, dest: AudioNode, t0: number, barIndex: number, rand: () => number = Math.random) {
  for (const e of planBar(barIndex, rand)) {
    const t = t0 + e.at;
    if (e.kind === "keys") playKeys(ctx, dest, t, e);
    else if (e.kind === "skank") playSkank(ctx, dest, t, e);
    else if (e.kind === "organ") playOrgan(ctx, dest, t, e);
    else if (e.kind === "bass") playBass(ctx, dest, t, e);
    else if (e.kind === "melody") playMelodica(ctx, dest, t, e);
    else if (e.kind === "kick") playKick(ctx, dest, t, e);
    else if (e.kind === "rim") playRim(ctx, dest, t, e);
    else if (e.kind === "tom") playTom(ctx, dest, t, e);
    else if (e.kind === "hat") playNoise(ctx, dest, t, e, 8000, 1.2, 0.045);
    else playNoise(ctx, dest, t, e, 3000, 0.7, 0.03);
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
