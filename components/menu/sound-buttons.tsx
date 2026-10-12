"use client";

import { useEffect, useState } from "react";
import { Music, Volume2, VolumeX } from "lucide-react";
import { getSoundState, subscribeSound, toggleMusic, toggleSfx } from "@/lib/sound";

const BUTTON =
  "flex h-8 w-8 items-center justify-center rounded-full border transition";

// Dos botoncitos del encabezado: música ambiente (apagada de entrada) y
// sonidos de carrito/pedido (se pueden silenciar).
export function SoundButtons() {
  const [state, setState] = useState({ music: false, sfx: true });

  useEffect(() => {
    const sync = () => setState(getSoundState());
    sync();
    return subscribeSound(sync);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={toggleMusic}
        aria-label={state.music ? "Pausar música" : "Poner música"}
        aria-pressed={state.music}
        title={state.music ? "Pausar música" : "Poner música"}
        className={`${BUTTON} ${
          state.music
            ? "border-ember/60 bg-ember/15 text-ember"
            : "border-white/10 text-stone-300 hover:border-white/25"
        }`}
      >
        <Music className={`h-4 w-4 ${state.music ? "animate-pulse" : ""}`} />
      </button>
      <button
        type="button"
        onClick={toggleSfx}
        aria-label={state.sfx ? "Silenciar sonidos" : "Activar sonidos"}
        aria-pressed={state.sfx}
        title={state.sfx ? "Silenciar sonidos" : "Activar sonidos"}
        className={`${BUTTON} border-white/10 hover:border-white/25 ${state.sfx ? "text-stone-300" : "text-stone-500"}`}
      >
        {state.sfx ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      </button>
    </>
  );
}
