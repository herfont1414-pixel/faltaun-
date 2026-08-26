interface CategoryFilterProps {
  categories: string[];
  active: string;
  onChange: (category: string) => void;
}

export function CategoryFilter({ categories, active, onChange }: CategoryFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {["Todos", ...categories].map((category) => {
        const isActive = category === active;
        return (
          <button
            key={category}
            type="button"
            onClick={() => onChange(category)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm transition ${
              isActive
                ? "border-ember bg-ember text-base"
                : "border-white/10 text-stone-300 hover:border-white/25"
            }`}
          >
            {category}
          </button>
        );
      })}
    </div>
  );
}
