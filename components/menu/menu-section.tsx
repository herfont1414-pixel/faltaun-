"use client";

import { useMemo, useState } from "react";
import { CategoryFilter } from "@/components/menu/category-filter";
import { MenuCard } from "@/components/menu/menu-card";
import { MenuModal } from "@/components/menu/menu-modal";
import type { MenuItem } from "@/lib/types";

interface MenuSectionProps {
  items: MenuItem[];
}

export function MenuSection({ items }: MenuSectionProps) {
  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.category))), [items]);
  const [activeCategory, setActiveCategory] = useState<string>("Todos");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  const filteredItems = useMemo(() => {
    if (activeCategory === "Todos") return items;
    return items.filter((item) => item.category === activeCategory);
  }, [items, activeCategory]);

  return (
    <section id="menu" className="py-6">
      <div className="px-5">
        <h2 className="font-display text-2xl text-stone-50">Nuestro menú</h2>
        <p className="mt-1 text-sm text-stone-400">Elegí una categoría para explorar la carta.</p>
      </div>

      <div className="mt-4">
        <CategoryFilter categories={categories} active={activeCategory} onChange={setActiveCategory} />
      </div>

      <div className="mt-4 flex flex-col gap-2.5 px-5">
        {filteredItems.map((item) => (
          <MenuCard key={item.id} item={item} onSelect={setSelectedItem} />
        ))}

        {filteredItems.length === 0 && (
          <p className="py-8 text-center text-sm text-stone-500">
            Todavía no hay platos cargados en esta categoría.
          </p>
        )}
      </div>

      {selectedItem && (
        <MenuModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </section>
  );
}
