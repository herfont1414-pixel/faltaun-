"use client";

import { useState } from "react";
import Image from "next/image";
import { X, UtensilsCrossed, Plus } from "lucide-react";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { buildMenuItemInquiry } from "@/lib/whatsapp";
import { useCart } from "@/components/menu/cart-context";
import type { MenuItem } from "@/lib/types";

interface MenuModalProps {
  item: MenuItem;
  onClose: () => void;
}

export function MenuModal({ item, onClose }: MenuModalProps) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-base-card sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative h-52 w-full overflow-hidden rounded-t-2xl bg-base-soft">
          {item.image_url ? (
            <Image src={item.image_url} alt={item.name} fill className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <UtensilsCrossed className="h-10 w-10 text-stone-600" strokeWidth={1.25} />
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-3 top-3 rounded-full bg-black/50 p-1.5 text-stone-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-xl text-stone-50">{item.name}</h3>
              {!item.inStock && (
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-300">
                  Sin stock
                </span>
              )}
            </div>
            <span className="shrink-0 font-display text-lg text-ember-soft">
              ${item.price.toLocaleString("es-AR")}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-stone-400">{item.description}</p>

          {item.inStock ? (
            <button
              type="button"
              onClick={() => {
                addItem(item.name, item.price);
                setAdded(true);
                setTimeout(onClose, 500);
              }}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-ember px-5 py-2.5 text-sm font-medium text-base transition hover:bg-ember-soft"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              {added ? "¡Agregado!" : "Agregar al pedido"}
            </button>
          ) : (
            <div className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-white/5 px-5 py-2.5 text-sm font-medium text-stone-400">
              Sin stock por ahora
            </div>
          )}

          <WhatsAppButton
            href={buildMenuItemInquiry(item)}
            label="Consultar por WhatsApp"
            className="mt-2 w-full"
          />
        </div>
      </div>
    </div>
  );
}
