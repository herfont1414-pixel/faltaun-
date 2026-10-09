import { ArrowRight, Flame, Plus, Sparkles } from "lucide-react";
import { iconFor } from "@/components/menu/category-filter";
import type { MenuItem } from "@/lib/types";

interface HighlightsProps {
  popular: MenuItem[];
  special: { item: MenuItem; text: string } | null;
  onSelect: (item: MenuItem) => void;
}

const price = (n: number) => `$${n.toLocaleString("es-AR")}`;

// "Lo más pedido" y "Especial del día": atajos a productos que ya existen, sin fotos.
// Al tocarlos se abre el mismo modal del menú, que ya tiene el botón de agregar al carrito.
export function Highlights({ popular, special, onSelect }: HighlightsProps) {
  if (!special && popular.length === 0) return null;
  const SpecialIcon = special ? iconFor(special.item.category) : null;

  return (
    <div className="mb-7 space-y-6">
      {popular.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-5">
            <h3 className="flex items-center gap-2 font-display text-xl text-stone-50">
              <Flame className="h-5 w-5 text-ember" strokeWidth={1.8} />
              Lo más pedido
            </h3>
            <a href="#categorias" className="flex items-center gap-1 text-xs font-medium text-ember-soft">
              Ver todos <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2.5 px-5 sm:grid-cols-6">
            {popular.map((item, index) => {
              const Icon = iconFor(item.category);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  className={`${
                    index >= 3 ? "hidden sm:flex" : "flex"
                  } flex-col items-center rounded-2xl border bg-gradient-to-b from-base-card to-base px-2 pb-3 pt-3.5 text-center transition active:scale-[0.97] ${
                    index === 0 ? "border-ember/60 shadow-[0_0_18px_rgba(217,123,63,0.15)]" : "border-white/10"
                  }`}
                >
                  <Icon className="h-9 w-9 text-ember" strokeWidth={1.4} />
                  <span className="mt-2 line-clamp-2 min-h-[2.5em] text-[13px] font-medium leading-tight text-stone-50">
                    {item.name}
                  </span>
                  <span className="mt-1 font-display text-sm text-ember-soft">{price(item.price)}</span>
                  <span className="mt-2 flex h-8 w-8 items-center justify-center rounded-full bg-ember text-base">
                    <Plus className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {special && SpecialIcon && (
        <div className="px-5">
          <button
            type="button"
            onClick={() => onSelect(special.item)}
            className="w-full rounded-2xl border border-ember/50 bg-gradient-to-br from-ember/20 via-base-card to-base-card p-4 text-left shadow-[0_0_24px_rgba(217,123,63,0.12)] transition active:scale-[0.99]"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-display text-lg text-stone-50">
                <Sparkles className="h-5 w-5 text-ember" strokeWidth={1.8} />
                Especial del día
              </span>
              <span className="rounded-md bg-ember px-2 py-0.5 text-[10px] font-bold tracking-wider text-base">HOY</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <SpecialIcon className="h-11 w-11 shrink-0 text-ember" strokeWidth={1.3} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-tight text-stone-50">{special.item.name}</p>
                {special.text && <p className="mt-0.5 line-clamp-2 text-xs text-stone-400">{special.text}</p>}
                <p className="mt-1 font-display text-base text-ember-soft">{price(special.item.price)}</p>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ember text-base">
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
