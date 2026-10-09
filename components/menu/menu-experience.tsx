"use client";

import { MenuSection } from "@/components/menu/menu-section";
import { CartBar } from "@/components/menu/cart-bar";
import { CartSidebar } from "@/components/menu/cart-sidebar";
import type { MenuHighlights } from "@/lib/menu";
import type { MenuItem } from "@/lib/types";

export function MenuExperience({ items, highlights }: { items: MenuItem[]; highlights?: MenuHighlights | null }) {
  return (
    <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-8 lg:px-5">
      <MenuSection items={items} highlights={highlights} />
      <CartSidebar />
      <CartBar />
    </div>
  );
}
