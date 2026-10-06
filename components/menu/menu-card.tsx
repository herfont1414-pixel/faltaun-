import Image from "next/image";
import { UtensilsCrossed } from "lucide-react";
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
      className={`flex w-full items-center gap-4 rounded-xl2 border border-white/5 bg-base-card p-3 text-left transition hover:border-ember/30 active:scale-[0.99] ${
        item.inStock ? "" : "opacity-50"
      }`}
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-base-soft">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            sizes="64px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <UtensilsCrossed className="h-5 w-5 text-stone-600" strokeWidth={1.5} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-stone-50">{item.name}</p>
          {!item.inStock && (
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-300">
              Sin stock
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-1 text-sm text-stone-400">{item.description}</p>
      </div>

      <span className="shrink-0 font-display text-ember-soft">
        ${item.price.toLocaleString("es-AR")}
      </span>
    </button>
  );
}
