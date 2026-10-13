// Agrupa la categoría "Bebidas" (que en el catálogo trae todo junto) en Cervezas,
// Tragos, Vinos y Sin alcohol, SOLO para navegar la pantalla de Productos del panel.
// No cambia la categoría real de ningún producto ni el menú online.
//
// Se decide por el nombre: una palabra del nombre que empiece con alguna de estas.
// El orden importa: "Corona Sin Alcohol" es cerveza; "Gintonic" es trago.
// Lo que no se reconoce va a "Otras bebidas" (así ninguna bebida queda escondida).

export type DrinkGroupId = "cervezas" | "tragos" | "vinos" | "sin_alcohol" | "otras";

export const DRINK_GROUPS: { id: Exclude<DrinkGroupId, "otras">; label: string; words: string[] }[] = [
  {
    id: "cervezas",
    label: "Cervezas",
    words: [
      "cerveza", "heineken", "miller", "warsteiner", "quilmes", "patagonia", "patagania", "stella",
      "corona", "michelob", "estrella", "golden", "chopp", "imperial", "brahma", "budweiser", "andes",
      "schneider", "isenbeck", "amstel", "ipa", "lager", "stout",
    ],
  },
  {
    id: "tragos",
    label: "Tragos",
    words: [
      "trago", "gin", "negroni", "whisky", "tequila", "fernet", "aperol", "madona", "destornillador",
      "cuba", "gancia", "colo", "mojito", "caipi", "president", "daikiri", "daiquiri", "frozen", "medida",
      "jagger", "jager", "vodka", "ron", "campari", "spritz", "margarita", "shot",
    ],
  },
  {
    id: "vinos",
    label: "Vinos",
    words: [
      "vino", "malbec", "cabernet", "merlot", "syrah", "torrontes", "chardonnay", "blanco", "tinto",
      "rosado", "cosecha", "felicien", "nicasia", "chacabuco", "intocables", "catena", "cordero",
      "alamoa", "linda", "espumante", "champagne",
    ],
  },
  {
    id: "sin_alcohol",
    label: "Sin alcohol",
    words: [
      "agua", "acuarius", "aquarius", "cepita", "tonica", "limonada", "coca", "speed", "sprite", "fanta",
      "pepsi", "gaseosa", "jugo", "soda", "seven", "7up", "paso", "levite", "baggio", "cafe", "te",
    ],
  },
];

const OTHER_LABEL = "Otras bebidas";

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function isDrinksCategory(category: string) {
  return normalize(category).trim() === "bebidas";
}

export function drinkGroupOf(productName: string): DrinkGroupId {
  const tokens = normalize(productName).split(/[^a-z0-9]+/).filter(Boolean);
  for (const group of DRINK_GROUPS) {
    if (tokens.some((t) => group.words.some((w) => (w.length <= 2 ? t === w : t.startsWith(w))))) return group.id;
  }
  return "otras";
}

export function drinkGroupLabel(id: DrinkGroupId) {
  return DRINK_GROUPS.find((g) => g.id === id)?.label ?? OTHER_LABEL;
}
