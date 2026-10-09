import {
  LayoutGrid,
  Beef,
  Pizza,
  Sandwich,
  Salad,
  IceCream,
  CupSoda,
  Wine,
  Coffee,
  Fish,
  UtensilsCrossed,
} from "lucide-react";
import { customCategoryIcon } from "@/components/menu/category-icons";

interface CategoryFilterProps {
  categories: string[];
  active: string;
  onChange: (category: string) => void;
}

const KEYWORD_ICONS: { keywords: string[]; Icon: typeof Beef }[] = [
  { keywords: ["burger", "hamburguesa"], Icon: Beef },
  { keywords: ["pizza"], Icon: Pizza },
  { keywords: ["sandwich", "sándwich", "sanguche"], Icon: Sandwich },
  { keywords: ["ensalada", "salad"], Icon: Salad },
  { keywords: ["postre", "dulce", "helado"], Icon: IceCream },
  { keywords: ["bebida", "gaseosa", "jugo"], Icon: CupSoda },
  { keywords: ["vino", "trago", "cocktail", "coctel", "barra"], Icon: Wine },
  { keywords: ["café", "cafe", "infusion", "infusión"], Icon: Coffee },
  { keywords: ["pescado", "mar", "sushi"], Icon: Fish },
];

// Entradas, Empanadas y Al plato tienen icono propio (category-icons.tsx).
export function iconFor(category: string) {
  const custom = customCategoryIcon(category);
  if (custom) return custom;
  const normalized = category.toLowerCase();
  const match = KEYWORD_ICONS.find((entry) => entry.keywords.some((kw) => normalized.includes(kw)));
  return match?.Icon ?? UtensilsCrossed;
}

export function CategoryFilter({ categories, active, onChange }: CategoryFilterProps) {
  return (
    <div className="flex gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {["Todos", ...categories].map((category) => {
        const isActive = category === active;
        const Icon = category === "Todos" ? LayoutGrid : iconFor(category);
        return (
          <button
            key={category}
            type="button"
            onClick={() => onChange(category)}
            className={`flex shrink-0 flex-col items-center gap-1.5 rounded-2xl border px-4 py-2.5 text-center transition ${
              isActive
                ? "border-ember bg-ember/15 text-ember-soft"
                : "border-white/5 bg-base-card text-stone-400 hover:border-white/15"
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} />
            <span className="whitespace-nowrap text-[11px] font-medium">{category}</span>
          </button>
        );
      })}
    </div>
  );
}
