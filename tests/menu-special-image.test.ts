import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { seedFreshDb, tearDownTestDb, anyInStockProduct } from "./helpers";
import {
  clearMenuSpecialImage,
  getMenuSpecial,
  getMenuSpecialImageData,
  getMenuSpecialImageInfo,
  setMenuSpecial,
  setMenuSpecialImage,
} from "@/lib/admin/menu-special";
import { getMenuHighlights, getMenuItems } from "@/lib/menu";
import { getPool } from "@/lib/admin/db";
import { GET as publicImage } from "@/app/api/menu-special/image/route";

let dbPath: string;
let productId: number;
let otherId: number;
// JPEG mínimo válido (1×1) en base64.
const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

beforeAll(async () => {
  dbPath = await seedFreshDb("menu-special-image");
  productId = (await anyInStockProduct()).id;
  const { rows } = await getPool().query("select id from gestion_products where id <> $1 and in_stock = true and active = true order by id limit 1", [productId]);
  otherId = Number(rows[0].id);
  await setMenuSpecial({ active: true, productId, text: "Solo hoy" });
});
afterAll(() => tearDownTestDb(dbPath));

const special = async () => (await getMenuHighlights(await getMenuItems()))!.special;

describe("foto del especial del día", () => {
  it("rechaza archivos que no son imágenes y fotos demasiado pesadas", async () => {
    await expect(setMenuSpecialImage("hola", productId)).rejects.toThrow(/JPG, PNG o WebP/);
    await expect(setMenuSpecialImage("data:text/html;base64,PGgxPg==", productId)).rejects.toThrow(/JPG, PNG o WebP/);
    await expect(setMenuSpecialImage("data:image/jpeg;base64," + "A".repeat(2_100_000), productId)).rejects.toThrow(/pesada/);
    await expect(setMenuSpecialImage(TINY_JPEG, 999999)).rejects.toThrow(/no existe/);
    expect(await getMenuSpecialImageInfo()).toBeNull();
    expect((await special())!.imageUrl).toBeUndefined();
  });

  it("guardada para el producto del especial, el menú la muestra y se sirve como imagen", async () => {
    const info = await setMenuSpecialImage(TINY_JPEG, productId);
    expect(info.productId).toBe(productId);
    const s = await special();
    expect(s!.imageUrl).toBe(`/api/menu-special/image?v=${info.version}`);
    // El especial (producto, texto) no cambia por subir la foto.
    expect(await getMenuSpecial()).toEqual({ active: true, productId, text: "Solo hoy" });

    const data = await getMenuSpecialImageData();
    expect(data!.mime).toBe("image/jpeg");
    const res = await publicImage();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await res.arrayBuffer()).equals(data!.data)).toBe(true);
  });

  it("si el especial pasa a ser otro producto, la foto vieja deja de mostrarse (sin borrarse)", async () => {
    await setMenuSpecial({ active: true, productId: otherId, text: "" });
    expect((await special())!.imageUrl).toBeUndefined();
    expect(await getMenuSpecialImageInfo()).not.toBeNull();
    await setMenuSpecial({ active: true, productId, text: "" });
    expect((await special())!.imageUrl).toBeTruthy();
  });

  it("con el especial apagado no se muestra nada", async () => {
    await setMenuSpecial({ active: false, productId, text: "" });
    expect(await special()).toBeNull();
    await setMenuSpecial({ active: true, productId, text: "" });
  });

  it("quitar la foto la borra y el especial sigue sin foto", async () => {
    await clearMenuSpecialImage();
    expect(await getMenuSpecialImageInfo()).toBeNull();
    expect((await special())!.imageUrl).toBeUndefined();
    expect((await publicImage()).status).toBe(404);
  });
});
