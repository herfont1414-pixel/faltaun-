"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
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
  const [query, setQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  const filteredItems = useMemo(() => {
    let result = activeCategory === "Todos" ? items : items.filter((item) => item.category === activeCategory);
    const q = query.trim().toLowerCase();
    if (q) result = result.filter((item) => item.name.toLowerCase().includes(q));
    return result;
  }, [items, activeCategory, query]);

  return (
    <section id="menu" className="py-6">
      <div className="px-5">
        <h2 className="font-display text-2xl text-stone-50">Nuestro menú</h2>
        <p className="mt-1 text-sm text-stone-400">Elegí una categoría para explorar la carta.</p>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en el menú..."
            className="w-full rounded-full border border-white/10 bg-base-card py-2.5 pl-10 pr-4 text-sm text-stone-100 outline-none placeholder:text-stone-500"
          />
        </div>
      </div>

      <div className="mt-4">
        <CategoryFilter categories={categories} active={activeCategory} onChange={setActiveCategory} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 px-5 sm:grid-cols-3">
        {filteredItems.map((item) => (
          <MenuCard key={item.id} item={item} onSelect={setSelectedItem} />
        ))}

        {filteredItems.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-stone-500">
            No encontramos platos que coincidan con la búsqueda.
          </p>
        )}
      </div>

      {selectedItem && <MenuModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </section>
  );
}
