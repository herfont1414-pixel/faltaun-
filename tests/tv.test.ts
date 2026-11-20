import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getTvData, listTvFlyers, resolveTvFlyer } from "@/lib/tv";
import { getPool } from "@/lib/admin/db";
import { resetReadCache } from "@/lib/admin/read-cache";
import { GET as tvGet } from "@/app/api/tv/route";
import { GET as flyerGet } from "@/app/api/tv/flyer/[name]/route";

let dbPath: string;
let dir: string;

beforeAll(async () => {
  dbPath = await seedFreshDb("tv");
  dir = path.join(mkdtempSync(path.join(os.tmpdir(), "madero-tv-")), "MaderoSys-TV");
  process.env.MADERO_TV_DIR = dir;
});
afterAll(() => {
  delete process.env.MADERO_TV_DIR;
  rmSync(path.dirname(dir), { recursive: true, force: true });
  tearDownTestDb(dbPath);
});

describe("Madero TV", () => {
  it("crea la carpeta de flyers con un LEEME y lista solo imágenes, en orden", () => {
    expect(listTvFlyers()).toEqual([]);
    expect(existsSync(path.join(dir, "LEEME.txt"))).toBe(true);
    writeFileSync(path.join(dir, "b-promo.png"), "png");
    writeFileSync(path.join(dir, "a-pizza.JPG"), "jpg");
    writeFileSync(path.join(dir, "notas.txt"), "x");
    writeFileSync(path.join(dir, ".oculta.png"), "x");
    const names = listTvFlyers().map((f) => f.name);
    expect(names).toEqual(["a-pizza.JPG", "b-promo.png"]);
    expect(listTvFlyers()[0].url).toMatch(/^\/api\/tv\/flyer\/a-pizza\.JPG\?v=\d+$/);
  });

  it("solo sirve imágenes de esa carpeta (sin rutas ni otros archivos)", async () => {
    expect(resolveTvFlyer("a-pizza.JPG")).toBe(path.join(dir, "a-pizza.JPG"));
    for (const bad of ["../a-pizza.JPG", "notas.txt", ".oculta.png", "no-existe.png", "..\\x.png"]) expect(resolveTvFlyer(bad)).toBeNull();
    const ok = await flyerGet(new Request("http://localhost/api/tv/flyer/b-promo.png"), { params: { name: "b-promo.png" } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    const bad = await flyerGet(new Request("http://localhost/api/tv/flyer/x"), { params: { name: encodeURIComponent("../tv.test.ts") } });
    expect(bad.status).toBe(404);
  });

  it("arma los destacados con precio, la fidelidad y los QR al menú", async () => {
    const data = await getTvData(new Date("2030-01-01T12:00:00Z"));
    expect(data.featured).toHaveLength(6);
    // Mezcla: burger, pizza, empanada, burger, pizza, empanada.
    expect(data.featured.map((p) => p.category)).toEqual(["Burger", "Pizzas", "Empanadas", "Burger", "Pizzas", "Empanadas"]);
    for (const p of data.featured) {
      expect(p.price).toBeGreaterThan(0);
      expect(p.category).not.toMatch(/bebida|salsa|vajilla/i);
    }
    expect(data.featuredKind).toBe("recomendados");
    // El mismo día, los mismos destacados.
    expect((await getTvData(new Date("2030-01-01T20:00:00Z"))).featured).toEqual(data.featured);
    expect(data.rewards.map((r) => r.firstMilestone)).toEqual([5, 15]);
    expect(data.qrMenu).toContain("<svg");
    expect(data.qrFidelidad).toContain("<svg");
    expect(data.menuUrl).toMatch(/^https?:\/\//);
    expect(data.flyers.map((f) => f.name)).toEqual(["a-pizza.JPG", "b-promo.png"]);
    const res = await tvGet();
    expect(res.status).toBe(200);
    expect((await res.json()).featured).toHaveLength(6);
  });

  it("los destacados no incluyen combos", async () => {
    const catId = (await getPool().query("select id from gestion_categories where name = 'Burger'")).rows[0].id;
    await getPool().query("insert into gestion_products (category_id, name, price, active, in_stock) values ($1, 'Combo Prueba Burger', 9999, true, true)", [catId]);
    resetReadCache();
    for (const day of ["2030-01-01", "2030-01-02", "2030-01-03", "2030-01-04", "2030-01-05", "2030-01-06"]) {
      const data = await getTvData(new Date(`${day}T12:00:00Z`));
      expect(data.featured.some((p) => /combo|promo/i.test(p.name) || /combo|promo/i.test(p.category))).toBe(false);
      expect(data.featured).toHaveLength(6);
    }
  });
  it("los favoritos salen de las ventas reales (Fudo + sistema) y «¿Ya los probaste?» de lo que menos se pide", async () => {
    const data = await getTvData(new Date("2026-11-20T15:00:00Z"));
    expect(data.featuredKind).toBe("popular");
    const fav = data.featured.map((p) => p.name);
    expect(fav).toContain("Burger Clasica");
    expect(fav).toContain("Emp Carne Pic Cuchillo");
    expect(fav).not.toContain("Burger Blue Cheese");
    expect(data.toTry).toHaveLength(6);
    expect(data.toTry.map((p) => p.category)).toEqual(["Burger", "Pizzas", "Empanadas", "Burger", "Pizzas", "Empanadas"]);
    for (const p of data.toTry) expect(fav).not.toContain(p.name);
    expect(data.toTry.map((p) => p.name)).not.toContain("Emp Carne Pic Cuchillo");
    // El mismo día, la misma selección; otro día puede cambiar.
    expect((await getTvData(new Date("2026-11-20T22:00:00Z"))).toTry).toEqual(data.toTry);
  });
});
