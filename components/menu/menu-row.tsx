import { Plus } from "lucide-react";
import type { MenuItem } from "@/lib/types";

interface MenuRowProps {
  item: MenuItem;
  onSelect: (item: MenuItem) => void;
}

export function MenuRow({ item, onSelect }: MenuRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`flex w-full items-center gap-3 py-3.5 text-left transition active:bg-white/5 ${
        item.inStock ? "" : "opacity-50"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-medium text-stone-50">{item.name}</p>
          {!item.inStock && (
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-stone-300">
              Sin stock
            </span>
          )}
        </div>
        {item.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-stone-500">{item.description}</p>
        )}
        <span className="mt-1 block font-display text-sm text-ember-soft">
          ${item.price.toLocaleString("es-AR")}
        </span>
      </div>

      {item.inStock && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ember/15 text-ember-soft transition group-active:scale-90">
          <Plus className="h-4 w-4" strokeWidth={2.5} />
        </span>
      )}
    </button>
  );
}
