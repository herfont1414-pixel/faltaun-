"use client";

import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/components/menu/cart-context";
import { CheckoutModal } from "@/components/menu/checkout-modal";

export function CartBar() {
  const { count, total } = useCart();
  const [open, setOpen] = useState(false);

  // No ocultar la barra mientras el modal está abierto: al confirmar el
  // pedido se vacía el carrito (count vuelve a 0) y necesitamos que siga
  // montado para mostrar "¡Pedido enviado!" en vez de desaparecer de golpe.
  if (count === 0 && !open) return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mx-auto flex w-full max-w-sm items-center justify-between rounded-full bg-ember px-5 py-3 text-sm font-medium text-base shadow-lg"
        >
          <span className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" strokeWidth={2} />
            {count} producto{count > 1 ? "s" : ""}
          </span>
          <span>${total.toLocaleString("es-AR")}</span>
        </button>
      </div>
      {open && <CheckoutModal onClose={() => setOpen(false)} />}
    </>
  );
}
