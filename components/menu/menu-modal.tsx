"use client";

import { useState } from "react";
import Image from "next/image";
import { X, Plus, Minus } from "lucide-react";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { buildMenuItemInquiry } from "@/lib/whatsapp";
import { useCart } from "@/components/menu/cart-context";
import { iconFor } from "@/components/menu/category-filter";
import { useBusinessConfig } from "@/lib/use-business-config";
import type { MenuItem } from "@/lib/types";

interface MenuModalProps {
  item: MenuItem;
  onClose: () => void;
}

export function MenuModal({ item, onClose }: MenuModalProps) {
  const { addItem } = useCart();
  const businessConfig = useBusinessConfig();
  const [added, setAdded] = useState(false);
  const [qty, setQty] = useState(1);
  const Icon = iconFor(item.category);
  const description = item.description?.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      {/* Panel con altura máxima: lo largo se desplaza adentro y las acciones quedan siempre a la vista. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-base-card shadow-2xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ember/10 text-ember">
              <Icon className="h-5 w-5" strokeWidth={1.5} />
            </span>
            <span className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-soft">
              {item.category}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-stone-100 transition hover:bg-white/10 active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-4">
          {item.image_url && (
            <div className="relative mb-4 h-40 w-full overflow-hidden rounded-2xl bg-base-soft">
              <Image src={item.image_url} alt={item.name} fill className="object-cover" />
            </div>
          )}
          <h3 className="break-words font-display text-2xl leading-tight text-stone-50">{item.name}</h3>
          {description && <p className="mt-2 text-sm leading-relaxed text-stone-400">{description}</p>}
          <div className="mt-3 flex items-center gap-3">
            <span className="font-display text-3xl leading-none text-ember-soft">
              ${item.price.toLocaleString("es-AR")}
            </span>
            {!item.inStock && (
              <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-300">
                Sin stock
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-white/10 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          {item.inStock ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-stone-300">Cantidad</span>
                <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-stone-100 transition hover:bg-white/15 active:scale-95"
                    aria-label="Restar"
                  >
                    <Minus className="h-5 w-5" strokeWidth={2.25} />
                  </button>
                  <span className="min-w-[44px] text-center text-lg font-semibold text-stone-50">{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => q + 1)}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-stone-100 transition hover:bg-white/15 active:scale-95"
                    aria-label="Sumar"
                  >
                    <Plus className="h-5 w-5" strokeWidth={2.25} />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  addItem(item.name, item.price, qty);
                  setAdded(true);
                  setTimeout(onClose, 500);
                }}
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ember px-5 text-[15px] font-semibold text-base shadow-lg shadow-ember/20 transition hover:bg-ember-soft active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                {added ? "¡Agregado!" : `Agregar al carrito · $${(item.price * qty).toLocaleString("es-AR")}`}
              </button>
            </>
          ) : (
            <div className="flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-stone-400">
              Sin stock por ahora
            </div>
          )}

          <WhatsAppButton
            href={buildMenuItemInquiry(item, businessConfig?.whatsappNumber || undefined)}
            label="Consultar por WhatsApp"
            className="mt-2.5 w-full !border !border-ember/40 !bg-transparent !text-ember-soft hover:!bg-ember/10"
          />
        </div>
      </div>
    </div>
  );
}
