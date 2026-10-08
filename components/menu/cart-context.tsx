"use client";

import { createContext, useContext, useMemo, useState } from "react";

export interface CartItem {
  name: string;
  price: number;
  qty: number;
}

export type Fulfillment = "delivery" | "retiro";

interface CartContextValue {
  items: CartItem[];
  addItem: (name: string, price: number, qty?: number) => void;
  changeQty: (name: string, delta: number) => void;
  clear: () => void;
  total: number;
  count: number;
  fulfillment: Fulfillment;
  setFulfillment: (value: Fulfillment) => void;
  scheduledTime: string;
  setScheduledTime: (value: string) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("delivery");
  const [scheduledTime, setScheduledTime] = useState("lo_antes_posible");

  function addItem(name: string, price: number, qty = 1) {
    setItems((prev) => {
      const existing = prev.find((it) => it.name === name);
      if (existing) {
        return prev.map((it) => (it.name === name ? { ...it, qty: it.qty + qty } : it));
      }
      return [...prev, { name, price, qty }];
    });
  }

  function changeQty(name: string, delta: number) {
    setItems((prev) =>
      prev
        .map((it) => (it.name === name ? { ...it, qty: it.qty + delta } : it))
        .filter((it) => it.qty > 0)
    );
  }

  function clear() {
    setItems([]);
  }

  const total = useMemo(() => items.reduce((sum, it) => sum + it.price * it.qty, 0), [items]);
  const count = useMemo(() => items.reduce((sum, it) => sum + it.qty, 0), [items]);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        changeQty,
        clear,
        total,
        count,
        fulfillment,
        setFulfillment,
        scheduledTime,
        setScheduledTime,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart debe usarse dentro de CartProvider");
  return ctx;
}
