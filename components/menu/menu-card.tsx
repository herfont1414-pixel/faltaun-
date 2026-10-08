import Image from "next/image";
import { UtensilsCrossed, Plus } from "lucide-react";
import type { MenuItem } from "@/lib/types";

interface MenuCardProps {
  item: MenuItem;
  onSelect: (item: MenuItem) => void;
}

export function MenuCard({ item, onSelect }: MenuCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`group flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-base-card text-left transition hover:border-ember/30 active:scale-[0.98] ${
        item.inStock ? "" : "opacity-50"
      }`}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-base-soft">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 50vw, 240px"
            className="object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <UtensilsCrossed className="h-7 w-7 text-stone-600" strokeWidth={1.25} />
          </div>
        )}
        {!item.inStock && (
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-200">
            Sin stock
          </span>
        )}
        {item.inStock && (
          <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-ember text-base shadow-md transition group-hover:bg-ember-soft group-active:scale-90">
            <Plus className="h-4 w-4" strokeWidth={2.5} />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-stone-50">{item.name}</p>
        {item.description && (
          <p className="line-clamp-1 text-xs text-stone-500">{item.description}</p>
        )}
        <span className="mt-auto pt-1 font-display text-base text-ember-soft">
          ${item.price.toLocaleString("es-AR")}
        </span>
      </div>
    </button>
  );
}
