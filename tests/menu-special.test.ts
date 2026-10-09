import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getMenuSpecial, setMenuSpecial } from "@/lib/admin/menu-special";
import { getMenuItems, getMenuHighlights } from "@/lib/menu";
import { getState, updateProduct } from "@/lib/admin/store";

let dbPath: string;
let productId: number;

beforeAll(async () => {
  dbPath = await seedFreshDb("menu-special");
  productId = Object.values((await getState()).catalog).flat()[0].id;
});

afterAll(() => {
  tearDownTestDb(dbPath);
});

describe("especial del día (configuración)", () => {
  it("arranca apagado y sin producto", async () => {
    expect(await getMenuSpecial()).toEqual({ active: false, productId: null, text: "" });
  });

  it("se guarda, se lee y el menú público lo toma", async () => {
    const saved = await setMenuSpecial({ active: true, productId, text: "  Con papas y bebida  " });
    expect(saved).toEqual({ active: true, productId, text: "Con papas y bebida" });
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
});
