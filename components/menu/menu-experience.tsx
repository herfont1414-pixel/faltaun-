"use client";

import { CartProvider } from "@/components/menu/cart-context";
import { MenuSection } from "@/components/menu/menu-section";
import { CartBar } from "@/components/menu/cart-bar";
import type { MenuItem } from "@/lib/types";

export function MenuExperience({ items }: { items: MenuItem[] }) {
  return (
    <CartProvider>
      <MenuSection items={items} />
      <CartBar />
    </CartProvider>
  );
}
