"use client";

import { ShoppingBag } from "lucide-react";
import { useCart } from "@/components/menu/cart-context";
import { CheckoutPanel } from "@/components/menu/checkout-panel";

export function CartSidebar() {
  const { count } = useCart();

  return (
    <div className="hidden lg:sticky lg:top-4 lg:block">
      <div className="rounded-2xl border border-white/5 bg-base-card p-5 shadow-sm">
        {count === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-stone-500">
            <ShoppingBag className="h-8 w-8" strokeWidth={1.25} />
            <p className="text-sm">Tu carrito está vacío</p>
            <p className="text-xs text-stone-600">Agregá platos del menú para armar tu pedido.</p>
          </div>
        ) : (
          <CheckoutPanel />
        )}
      </div>
    </div>
  );
}
