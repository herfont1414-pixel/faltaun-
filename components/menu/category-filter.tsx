import {
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

// Grilla de categorías con icono lineal naranja: tocar una lleva a su sección del menú.
export function CategoryFilter({ categories, active, onChange }: CategoryFilterProps) {
  return (
    <div className="grid grid-cols-3 gap-2.5 px-5 sm:grid-cols-4">
      {categories.map((category) => {
        const Icon = iconFor(category);
        return (
          <button
            key={category}
            type="button"
            onClick={() => onChange(category)}
            aria-current={category === active ? "true" : undefined}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-gradient-to-b from-base-card to-base px-2 py-4 text-center transition hover:border-ember/40 active:scale-[0.97]"
          >
            <Icon className="h-8 w-8 text-ember" strokeWidth={1.4} />
            <span className="text-[12.5px] font-medium leading-tight text-stone-100">{category}</span>
          </button>
        );
      })}
    </div>
  );
}
