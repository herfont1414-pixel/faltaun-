import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { seedFreshDb, tearDownTestDb, anyInStockProduct } from "./helpers";
import { getMenuSpecial, setMenuSpecial } from "@/lib/admin/menu-special";
import { getMenuItems, getMenuHighlights } from "@/lib/menu";
import { getTvData } from "@/lib/tv";
import { updateProduct } from "@/lib/admin/store";

let dbPath: string;
let productId: number;

beforeAll(async () => {
  dbPath = await seedFreshDb("menu-special");
  // Un producto garantizado disponible: el menú público ya no muestra los agotados.
  productId = (await anyInStockProduct()).id;
});

afterAll(() => {
  tearDownTestDb(dbPath);
});

describe("especial del día (configuración)", () => {
  it("arranca apagado y sin producto", async () => {
    expect(await getMenuSpecial()).toEqual({ active: false, productId: null, productId2: null, text: "" });
  });

  it("se guarda, se lee y el menú público lo toma", async () => {
    const saved = await setMenuSpecial({ active: true, productId, text: "  Con papas y bebida  " });
    expect(saved).toEqual({ active: true, productId, productId2: null, text: "Con papas y bebida" });
    expect(await getMenuSpecial()).toEqual(saved);

    const items = await getMenuItems();
    expect((await getMenuHighlights(items))!.special).toEqual({ id: String(productId), text: "Con papas y bebida" });
  });

  it("apagarlo lo saca del menú pero conserva la elección", async () => {
    await setMenuSpecial({ active: false, productId, text: "Con papas y bebida" });
    expect((await getMenuHighlights(await getMenuItems()))!.special).toBeNull();
    expect((await getMenuSpecial()).productId).toBe(productId);
  });

  it("valida: no se activa sin producto, ni con un producto inexistente o dado de baja, ni con texto largo", async () => {
    await expect(setMenuSpecial({ active: true, productId: null, text: "" })).rejects.toThrow("Elegí el producto");
    await expect(setMenuSpecial({ active: false, productId: 999999, text: "" })).rejects.toThrow("no existe");
    await expect(setMenuSpecial({ active: false, productId, text: "x".repeat(141) })).rejects.toThrow("hasta 140");

    await updateProduct(productId, { active: false });
    await expect(setMenuSpecial({ active: true, productId, text: "" })).rejects.toThrow("dado de baja");
    await updateProduct(productId, { active: true });
  });

  it("con un segundo producto: se muestran los dos, cada uno con su precio (menú y Madero TV)", async () => {
    const items = await getMenuItems();
    const other = items.find((i) => i.id !== String(productId) && i.inStock)!;
    const saved = await setMenuSpecial({ active: true, productId, productId2: Number(other.id), text: "Nuevas" });
    expect(saved.productId2).toBe(Number(other.id));
    expect(await getMenuSpecial()).toEqual(saved);
    expect((await getMenuHighlights(await getMenuItems()))!.special).toEqual({ id: String(productId), id2: other.id, text: "Nuevas" });

    const tv = await getTvData();
    expect(tv.special?.name).toBe(items.find((i) => i.id === String(productId))!.name);
    expect(tv.special?.also).toEqual({ name: other.name, price: other.price, category: other.category });

    // Sin segundo producto, la pantalla queda como siempre.
    await setMenuSpecial({ active: true, productId, productId2: null, text: "Nuevas" });
    expect((await getTvData()).special?.also).toBeNull();
  });

  it("valida el segundo producto: distinto del primero y nunca sin el primero", async () => {
    await expect(setMenuSpecial({ active: true, productId, productId2: productId, text: "" })).rejects.toThrow("distinto");
    await expect(setMenuSpecial({ active: false, productId: null, productId2: productId, text: "" })).rejects.toThrow("principal");
    await expect(setMenuSpecial({ active: true, productId, productId2: 999999, text: "" })).rejects.toThrow("no existe");
  });
});
