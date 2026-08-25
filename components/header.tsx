import { UtensilsCrossed } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-base/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="h-5 w-5 text-ember" strokeWidth={1.75} />
          <span className="font-display text-lg tracking-wide text-stone-50">
            Madero Restó
          </span>
        </div>
        <a
          href="#reservas"
          className="rounded-full border border-ember/40 px-4 py-1.5 text-sm text-ember-soft transition hover:bg-ember/10"
        >
          Reservar
        </a>
      </div>
    </header>
  );
}
