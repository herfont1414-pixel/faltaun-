"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { CategoryFilter, iconFor } from "@/components/menu/category-filter";
import { MenuRow } from "@/components/menu/menu-row";
import { MenuModal } from "@/components/menu/menu-modal";
import { Highlights } from "@/components/menu/highlights";
import type { MenuHighlights } from "@/lib/menu";
import type { MenuItem } from "@/lib/types";

interface MenuSectionProps {
  items: MenuItem[];
  highlights?: MenuHighlights | null;
}

export function MenuSection({ items, highlights }: MenuSectionProps) {
  const categories = useMemo(() => Array.from(new Set(items.map((item) => item.category))), [items]);
  const [activeCategory, setActiveCategory] = useState<string>(categories[0] ?? "Todos");
  const [query, setQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const wasSearching = useRef(false);

  // Destacados: mismos productos y precios del catálogo; los agotados no se muestran.
  const popular = useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i]));
    return (highlights?.popularIds ?? []).map((id) => byId.get(id)).filter((i): i is MenuItem => !!i && i.inStock);
  }, [items, highlights]);
  // La etiqueta "Más pedido" va solo en los 3 primeros del ranking.
  const popularIds = useMemo(() => new Set(popular.slice(0, 3).map((i) => i.id)), [popular]);
  const special = useMemo(() => {
    const item = highlights?.special ? items.find((i) => i.id === highlights.special!.id) : null;
    return item && item.inStock && highlights?.special ? { item, text: highlights.special.text } : null;
  }, [items, highlights]);

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    return categories
      .map((category) => ({
        category,
        // Disponibles primero; los agotados al final de cada categoría (mismo orden entre sí).
        items: items
          .filter((item) => item.category === category && (!q || item.name.toLowerCase().includes(q)))
          .sort((a, b) => Number(b.inStock) - Number(a.inStock)),
      }))
      .filter((group) => group.items.length > 0);
  }, [items, categories, q]);

  // Al empezar a buscar, los destacados de arriba se ocultan: se lleva la vista al buscador
  // para que el contenido no "salte" bajo el dedo.
  useEffect(() => {
    const searching = q !== "";
    if (searching && !wasSearching.current) searchRef.current?.scrollIntoView({ block: "start" });
    wasSearching.current = searching;
  }, [q]);

  function goToCategory(category: string) {
    setActiveCategory(category);
    sectionRefs.current[category]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    if (q) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const top = visible[0]?.target.getAttribute("data-category");
        if (top) setActiveCategory(top);
      },
      { rootMargin: "-110px 0px -70% 0px", threshold: 0 }
    );
    const nodes = Object.values(sectionRefs.current).filter((el): el is HTMLDivElement => !!el);
    nodes.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [groups, q]);

  return (
    <section id="menu" className="py-6">
      {!q && <Highlights popular={popular} special={special} onSelect={setSelectedItem} />}

      <div className="px-5">
        <h2 className="font-display text-2xl text-stone-50">Explorá nuestro menú</h2>
        <p className="mt-1 text-sm text-stone-400">Elegí una categoría para ver la carta.</p>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
          <input
            value={query}
            ref={searchRef}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en el menú..."
            className="w-full rounded-full border border-white/10 bg-base-card py-2.5 pl-10 pr-4 text-sm text-stone-100 outline-none placeholder:text-stone-500"
          />
        </div>
      </div>

      <div id="categorias" className="mt-4 scroll-mt-20">
        <CategoryFilter categories={categories} active={activeCategory} onChange={goToCategory} />
      </div>

      <div className="mt-2">
        {groups.map((group) => (
          <div
            key={group.category}
            ref={(el) => {
              sectionRefs.current[group.category] = el;
            }}
            data-category={group.category}
          >
            <div className="sticky top-[69px] z-20 border-b border-white/5 bg-base px-5 py-3">
              <h3 className="font-display text-xl text-stone-50">
                {(() => {
                  const HeaderIcon = iconFor(group.category);
                  return <HeaderIcon className="mr-2.5 inline-block h-6 w-6 align-[-4px] text-ember" strokeWidth={1.6} />;
                })()}
                {group.category}
              </h3>
            </div>
            <div className="flex flex-col gap-2 px-5 pb-4 pt-3">
              {group.items.map((item) => (
                <MenuRow key={item.id} item={item} onSelect={setSelectedItem} popular={popularIds.has(item.id)} />
              ))}
            </div>
          </div>
        ))}

        {groups.length === 0 && (
          <p className="py-8 text-center text-sm text-stone-500">
            No encontramos platos que coincidan con la búsqueda.
          </p>
        )}
      </div>

      {selectedItem && <MenuModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </section>
  );
}
