import type { MenuCategory } from "@/lib/types";

const CATEGORIES: { value: MenuCategory | "todos"; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "comidas", label: "Comidas" },
  { value: "tragos", label: "Tragos" },
  { value: "vinos", label: "Vinos" },
  { value: "postres", label: "Postres" },
];

interface CategoryFilterProps {
  active: MenuCategory | "todos";
  onChange: (category: MenuCategory | "todos") => void;
}

export function CategoryFilter({ active, onChange }: CategoryFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {CATEGORIES.map((category) => {
        const isActive = category.value === active;
        return (
          <button
            key={category.value}
            type="button"
            onClick={() => onChange(category.value)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm transition ${
              isActive
                ? "border-ember bg-ember text-base"
                : "border-white/10 text-stone-300 hover:border-white/25"
            }`}
          >
            {category.label}
          </button>
        );
      })}
    </div>
  );
}
