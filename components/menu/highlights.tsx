import { Flame, Plus, Sparkles } from "lucide-react";
import type { MenuItem } from "@/lib/types";

interface HighlightsProps {
  popular: MenuItem[];
  special: { item: MenuItem; text: string } | null;
  onSelect: (item: MenuItem) => void;
}

// "Especial del día" y "Lo más pedido": atajos compactos a productos que ya existen.
// Al tocarlos se abre el mismo modal del menú, que ya tiene el botón de agregar al carrito.
export function Highlights({ popular, special, onSelect }: HighlightsProps) {
  if (!special && popular.length === 0) return null;

  return (
    <div className="mt-5 space-y-5">
      {special && (
        <div className="px-5">
          <button
            type="button"
            onClick={() => onSelect(special.item)}
            className="flex w-full items-center gap-3 rounded-xl border border-ember/30 border-l-[3px] border-l-ember bg-ember/[0.06] px-4 py-3 text-left transition active:bg-ember/10"
          >
            <Sparkles className="h-5 w-5 shrink-0 text-ember-soft" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ember-soft">Especial del día</p>
              <p className="truncate font-display text-lg leading-tight text-stone-50">{special.item.name}</p>
              {special.text && <p className="mt-0.5 line-clamp-2 text-xs text-stone-400">{special.text}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-display text-base text-ember-soft">
                ${special.item.price.toLocaleString("es-AR")}
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ember/20 text-ember-soft">
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            </div>
          </button>
        </div>
      )}

      {popular.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 px-5 font-display text-lg text-stone-50">
            <Flame className="h-4 w-4 text-ember-soft" strokeWidth={2} />
            Lo más pedido
          </h3>
          <div className="mt-2 flex gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {popular.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                className="flex w-[148px] shrink-0 flex-col justify-between rounded-xl border border-white/5 bg-base-card px-3 py-2.5 text-left transition active:bg-white/5"
              >
                <span className="font-display text-xs text-ember-soft">#{index + 1}</span>
                <span className="mt-1 line-clamp-2 min-h-[2.4em] text-[13px] font-medium leading-tight text-stone-50">
                  {item.name}
                </span>
                <span className="mt-1.5 font-display text-sm text-ember-soft">
                  ${item.price.toLocaleString("es-AR")}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
