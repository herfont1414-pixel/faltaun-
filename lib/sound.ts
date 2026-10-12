"use client";

import { BAR_SECONDS, makeReverb, makeVintageChain, playAddSound, playSentSound, scheduleBar } from "@/lib/sound-engine";

// Estado del sonido del menú online. Todo es opcional:
//  - la música arranca APAGADA (los navegadores no dejan sonar solos y además
//    puede molestar), la prende el cliente con el botoncito;
//  - los sonidos de carrito/pedido vienen prendidos y se pueden silenciar,
//    y esa elección se recuerda en el dispositivo.

const PREF_KEY = "madero.sonidos";
const MUSIC_LEVEL = 1.2;
const LOOKAHEAD = 1.5; // segundos de música programados por adelantado

type Listener = () => void;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let reverbSend: GainNode | null = null;
let musicBus: GainNode | null = null;
let musicIn: AudioNode | null = null; // entrada de la cadena "vintage" de la música
let timer: ReturnType<typeof setInterval> | null = null;
let nextBarAt = 0;
let barIndex = 0;
let musicOn = false;
let sfxOn = true;
let prefsLoaded = false;
let hiddenPause = false;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

function loadPrefs() {
  if (prefsLoaded) return;
  prefsLoaded = true;
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) sfxOn = JSON.parse(raw).sfx !== false;
  } catch {
    // sin almacenamiento local: queda el valor por defecto.
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ sfx: sfxOn }));
  } catch {
    // no pasa nada si no se puede guardar.
  }
}

function getContext() {
  if (ctx) return ctx;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.9;
  const limiter = ctx.createDynamicsCompressor();
  master.connect(limiter).connect(ctx.destination);
  const reverb = makeReverb(ctx);
  reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.35;
  reverbSend.connect(reverb).connect(master);
  const vintage = makeVintageChain(ctx);
  vintage.output.connect(master);
  vintage.output.connect(reverbSend);
  musicIn = vintage.input;
  return ctx;
}

/** Hay que llamarla dentro de un toque/click: es lo que habilita el audio en el celu. */
export function unlockAudio() {
  loadPrefs();
  const c = getContext();
  if (c && c.state === "suspended" && !hiddenPause) void c.resume();
}

function pump() {
  if (!ctx || !musicBus) return;
  while (nextBarAt < ctx.currentTime + LOOKAHEAD) {
    scheduleBar(ctx, musicBus, nextBarAt, barIndex);
    barIndex++;
    nextBarAt += BAR_SECONDS;
  }
}

export function startMusic() {
  unlockAudio();
  if (!ctx || !musicIn || musicOn) return;
  musicOn = true;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0.0001, ctx.currentTime);
  bus.gain.linearRampToValueAtTime(MUSIC_LEVEL, ctx.currentTime + 1.5);
  bus.connect(musicIn);
  musicBus = bus;
  nextBarAt = ctx.currentTime + 0.1;
  barIndex = 0;
  pump();
  timer = setInterval(pump, 250);
  emit();
}

export function stopMusic() {
  if (!musicOn || !ctx) return;
  musicOn = false;
  if (timer) clearInterval(timer);
  timer = null;
  const bus = musicBus;
  musicBus = null;
  if (bus) {
    // Se baja de a poco y se suelta el bus: las notas ya programadas mueren con él.
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    setTimeout(() => bus.disconnect(), 600);
  }
  emit();
}

export function toggleMusic() {
  if (musicOn) stopMusic();
  else startMusic();
}

export function toggleSfx() {
  loadPrefs();
  sfxOn = !sfxOn;
  savePrefs();
  if (sfxOn) {
    // Confirmación audible de que quedó prendido.
    unlockAudio();
    playSfx("add");
  }
  emit();
}

export function playSfx(kind: "add" | "sent") {
  loadPrefs();
  if (!sfxOn) return;
  unlockAudio();
  if (!ctx || !master || ctx.state !== "running") return;
  if (kind === "add") playAddSound(ctx, master);
  else playSentSound(ctx, master);
}

export function getSoundState() {
  loadPrefs();
  return { music: musicOn, sfx: sfxOn };
}

export function subscribeSound(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Si el cliente cambia de pestaña o apaga la pantalla, la música se frena sola.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) {
      if (musicOn) {
        hiddenPause = true;
        void ctx.suspend();
      }
    } else if (hiddenPause) {
      hiddenPause = false;
      void ctx.resume();
    }
  });
}
