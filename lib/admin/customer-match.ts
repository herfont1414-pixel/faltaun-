import type { DirectoryCustomer } from "@/lib/admin/crm";

const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// Sugerencias mientras se escribe el nombre (o el teléfono) del cliente: todas las palabras
// escritas tienen que ser el comienzo de alguna palabra del nombre ("ped go" → "Pedro
// Gómez"); con 3 o más números, también busca por teléfono. Primero los que empiezan con
// lo escrito y, entre iguales, los que más compraron.
export function matchCustomers(list: DirectoryCustomer[], query: string, limit = 6): DirectoryCustomer[] {
  const q = plain(query);
  if (q.length < 2) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const digits = q.replace(/\D/g, "");
  const scored: { c: DirectoryCustomer; rank: number }[] = [];
  for (const c of list) {
    const name = plain(c.name);
    const nameWords = name.split(/[\s.,-]+/).filter(Boolean);
    const byName = words.every((w) => nameWords.some((nw) => nw.startsWith(w)));
    const byPhone = digits.length >= 3 && digits.length === q.replace(/[\s+()-]/g, "").length && !!c.phone && c.phone.replace(/\D/g, "").includes(digits);
    if (!byName && !byPhone) continue;
    scored.push({ c, rank: name.startsWith(q) ? 0 : byName ? 1 : 2 });
  }
  scored.sort((a, b) => a.rank - b.rank || b.c.orders - a.c.orders || b.c.spent - a.c.spent || a.c.name.localeCompare(b.c.name));
  // El mismo cliente puede venir de dos lugares (con y sin teléfono): no repetir.
  const seen = new Set<string>();
  const out: DirectoryCustomer[] = [];
  for (const { c } of scored) {
    const key = `${plain(c.name)}|${c.phone ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}
