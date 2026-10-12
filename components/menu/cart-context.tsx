"use client";

import { createContext, useContext, useMemo, useState } from "react";

// Aclaración por producto ("sin tomate", "bien cocida"…). Mismo límite que en el servidor.
export const ITEM_NOTE_MAX = 120;

export interface CartItem {
  // Identifica la línea: mismo producto con distinta aclaración = líneas distintas
  // (ej.: una burger "sin tomate" y otra normal).
  key: string;
  name: string;
  price: number;
  qty: number;
  note: string;
}

export type Fulfillment = "delivery" | "retiro";

interface CartContextValue {
  items: CartItem[];
  addItem: (name: string, price: number, qty?: number, note?: string) => void;
  changeQty: (key: string, delta: number) => void;
  setNote: (key: string, note: string) => void;
  clear: () => void;
  total: number;
  count: number;
  fulfillment: Fulfillment;
  setFulfillment: (value: Fulfillment) => void;
  scheduledTime: string;
  setScheduledTime: (value: string) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function cleanNote(note: string | undefined | null) {
  return (note ?? "").replace(/\s+/g, " ").trim().slice(0, ITEM_NOTE_MAX);
}
const lineKey = (name: string, note: string) => `${name}\u0000${note.toLowerCase()}`;

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("delivery");
  const [scheduledTime, setScheduledTime] = useState("lo_antes_posible");

  function addItem(name: string, price: number, qty = 1, rawNote = "") {
    const note = cleanNote(rawNote);
    const key = lineKey(name, note);
    setItems((prev) => {
      const existing = prev.find((it) => it.key === key);
      if (existing) {
        return prev.map((it) => (it.key === key ? { ...it, qty: it.qty + qty } : it));
      }
      return [...prev, { key, name, price, qty, note }];
    });
  }

  function changeQty(key: string, delta: number) {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, qty: it.qty + delta } : it)).filter((it) => it.qty > 0)
    );
  }

  // Cambiar la aclaración de una línea. Si queda igual a otra línea del mismo producto,
  // se juntan en una sola (se suman las cantidades).
  function setNote(key: string, rawNote: string) {
    const note = cleanNote(rawNote);
    setItems((prev) => {
      const line = prev.find((it) => it.key === key);
      if (!line) return prev;
      const newKey = lineKey(line.name, note);
      if (newKey === key) return prev.map((it) => (it.key === key ? { ...it, note } : it));
      const twin = prev.find((it) => it.key === newKey);
      if (twin) {
        return prev
          .filter((it) => it.key !== key)
          .map((it) => (it.key === newKey ? { ...it, qty: it.qty + line.qty } : it));
      }
      return prev.map((it) => (it.key === key ? { ...it, key: newKey, note } : it));
    });
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
        setNote,
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
