import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { drinkGroupOf, isDrinksCategory } from "../lib/admin/drink-groups";

const catalog = JSON.parse(readFileSync(path.join(process.cwd(), "data", "catalogo_productos.json"), "utf-8")) as Record<
  string,
  { name: string }[]
>;

describe("pestañas de bebidas en Productos", () => {
  it("reconoce la categoría Bebidas sin importar mayúsculas", () => {
    expect(isDrinksCategory("Bebidas")).toBe(true);
    expect(isDrinksCategory(" BEBIDAS ")).toBe(true);
    expect(isDrinksCategory("Pizzas")).toBe(false);
  });

  it("todas las bebidas del catálogo real caen en un grupo (ninguna en 'Otras')", () => {
    const sinGrupo = catalog.Bebidas.filter((p) => drinkGroupOf(p.name) === "otras").map((p) => p.name);
    expect(sinGrupo).toEqual([]);
  });

  it("clasifica bien los casos dudosos", () => {
    expect(drinkGroupOf("Corona Sin Alcohol 330ml")).toBe("cervezas");
    expect(drinkGroupOf("Estrella Galicia 0.0")).toBe("cervezas");
    expect(drinkGroupOf("Stella Sin Alcohol Lata")).toBe("cervezas");
    expect(drinkGroupOf("Gintonic Premium")).toBe("tragos");
    expect(drinkGroupOf("Tonica Lata")).toBe("sin_alcohol");
    expect(drinkGroupOf("Limon Frozen")).toBe("tragos");
    expect(drinkGroupOf("Medida Tequila")).toBe("tragos");
    expect(drinkGroupOf("Vino Cordero Blanco")).toBe("vinos");
    expect(drinkGroupOf("Dv Catena Cabernet-Malbec")).toBe("vinos");
    expect(drinkGroupOf("Coca 1.5 De Plastico")).toBe("sin_alcohol");
    expect(drinkGroupOf("Speed 250Ml")).toBe("sin_alcohol");
  });

  it("el reparto del catálogo actual: cervezas, tragos, vinos y sin alcohol en su lugar", () => {
    const count = (id: string) => catalog.Bebidas.filter((p) => drinkGroupOf(p.name) === id).length;
    // Orden del catálogo: 19 cervezas, 21 tragos, 12 vinos y 24 sin alcohol (76 en total).
    expect({ cervezas: count("cervezas"), tragos: count("tragos"), vinos: count("vinos"), sin: count("sin_alcohol") }).toEqual({
      cervezas: 19,
      tragos: 21,
      vinos: 12,
      sin: 24,
    });
  });

  it("una bebida desconocida va a 'Otras bebidas' (no se pierde)", () => {
    expect(drinkGroupOf("Hidromiel Artesanal")).toBe("otras");
  });
});
