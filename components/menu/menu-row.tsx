import { Plus, Star } from "lucide-react";
import { iconFor } from "@/components/menu/category-filter";
import type { MenuItem } from "@/lib/types";

interface MenuRowProps {
  item: MenuItem;
  onSelect: (item: MenuItem) => void;
  // Está entre "Lo más pedido".
  popular?: boolean;
}

// Fila compacta de producto, sin foto: icono de la categoría, nombre, descripción breve,
// precio y botón +. Los agotados se ven apagados, con el precio tachado y la etiqueta
// "Sin stock" en lugar del botón; siguen abriendo el modal (que no deja agregarlos y
// ofrece consultar por WhatsApp).
export function MenuRow({ item, onSelect, popular = false }: MenuRowProps) {
  const Icon = iconFor(item.category);
  const price = `$${item.price.toLocaleString("es-AR")}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition active:scale-[0.99] ${
        item.inStock
          ? "border-white/10 bg-base-card active:bg-white/5"
          : "border-white/5 bg-base-soft/60"
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          item.inStock ? "bg-ember/10 text-ember" : "bg-white/5 text-stone-600"
        }`}
      >
        <Icon className="h-6 w-6" strokeWidth={1.5} />
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={`line-clamp-2 text-[15px] font-semibold leading-snug ${
            item.inStock ? "text-stone-50" : "text-stone-500"
          }`}
        >
          {item.name}
        </p>
        {item.description && (
          <p className={`mt-0.5 line-clamp-2 text-xs ${item.inStock ? "text-stone-400" : "text-stone-600"}`}>
            {item.description}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2">
          <span className={`font-display text-base ${item.inStock ? "text-ember-soft" : "text-stone-600 line-through"}`}>
            {price}
          </span>
          {popular && item.inStock && (
            <span className="inline-flex items-center gap-1 rounded-md border border-ember/40 px-1.5 py-0.5 text-[10px] font-semibold text-ember-soft">
              <Star className="h-2.5 w-2.5" fill="currentColor" /> Más pedido
            </span>
          )}
        </div>
      </div>

      {item.inStock ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ember text-base">
          <Plus className="h-4 w-4" strokeWidth={2.5} />
        </span>
      ) : (
        <span className="shrink-0 rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-300">
          Sin stock
        </span>
      )}
    </button>
  );
}
