import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { createSession, hashPin, SESSION_COOKIE } from "@/lib/admin/auth";
import { deleteTvFlyer, listTvFlyers, safeFlyerName, saveTvFlyer } from "@/lib/tv";
import { DELETE as flyersDelete, GET as flyersGet, POST as flyersPost } from "@/app/api/admin/tv-flyers/route";

let dbPath: string;
let dir: string;
let encargadoId: number;
let mozoId: number;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

beforeAll(async () => {
  dbPath = await seedFreshDb("tv-flyers");
  dir = path.join(mkdtempSync(path.join(os.tmpdir(), "madero-tvf-")), "MaderoSys-TV");
  process.env.MADERO_TV_DIR = dir;
  const mk = async (name: string, role: string) =>
    Number((await getPool().query("insert into gestion_users (name, pin_hash, role, active) values ($1, $2, $3, true) returning id", [name, hashPin("3344"), role])).rows[0].id);
  encargadoId = await mk("Encargado F", "encargado");
  mozoId = await mk("Mozo F", "mozo");
});
afterAll(() => {
  delete process.env.MADERO_TV_DIR;
  rmSync(path.dirname(dir), { recursive: true, force: true });
  tearDownTestDb(dbPath);
});

describe("flyers de Madero TV desde el panel", () => {
  it("guarda solo imágenes de verdad, con nombre prolijo y sin pisar otro", () => {
    expect(safeFlyerName("Promo Pizzas ñandú (2).jpeg", ".jpg")).toBe("Promo-Pizzas-nandu-2.jpg");
    expect(safeFlyerName("../../malo.exe", ".png")).toBe("malo.png");
    expect(saveTvFlyer("Burgers con papas.png", PNG).name).toBe("Burgers-con-papas.png");
    expect(saveTvFlyer("Burgers con papas.png", PNG).name).toBe("Burgers-con-papas-2.png");
    // El nombre dice .png pero es un JPG: se guarda como .jpg.
    expect(saveTvFlyer("foto.png", JPG).name).toBe("foto.jpg");
    expect(() => saveTvFlyer("virus.jpg", new Uint8Array([0x4d, 0x5a, 1, 2]))).toThrow(/Solo se pueden subir imágenes/);
    expect(listTvFlyers().map((f) => f.name)).toEqual(["Burgers-con-papas-2.png", "Burgers-con-papas.png", "foto.jpg"]);
    expect(deleteTvFlyer("foto.jpg")).toBe(true);
    expect(deleteTvFlyer("../foto.jpg")).toBe(false);
    expect(existsSync(path.join(dir, "foto.jpg"))).toBe(false);
  });

  it("subir y sacar desde el panel: admin y encargado sí, mozo no", async () => {
    const cookie = async (id: number) => `${SESSION_COOKIE}=${await createSession(id)}`;
    const form = () => {
      const f = new FormData();
      f.append("files", new File([PNG], "Pizzas nuevas.png", { type: "image/png" }));
      f.append("files", new File([new Uint8Array([1, 2, 3])], "no-es-imagen.png", { type: "image/png" }));
      return f;
    };
    const mozoReq = new NextRequest("http://localhost/api/admin/tv-flyers", { method: "POST", headers: { cookie: await cookie(mozoId) }, body: form() });
    expect((await flyersPost(mozoReq)).status).toBe(401);

    const res = await flyersPost(new NextRequest("http://localhost/api/admin/tv-flyers", { method: "POST", headers: { cookie: await cookie(encargadoId) }, body: form() }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.saved).toEqual(["Pizzas-nuevas.png"]);
    expect(data.errors[0]).toMatch(/no-es-imagen\.png: Solo se pueden subir imágenes/);
    expect(readFileSync(path.join(dir, "Pizzas-nuevas.png"))).toEqual(Buffer.from(PNG));

    const list = await (await flyersGet(new NextRequest("http://localhost/api/admin/tv-flyers", { headers: { cookie: await cookie(encargadoId) } }))).json();
    expect(list.flyers.map((f: { name: string }) => f.name)).toContain("Pizzas-nuevas.png");
    expect(list.dir).toBe(dir);

    const del = await flyersDelete(new NextRequest("http://localhost/api/admin/tv-flyers?name=Pizzas-nuevas.png", { method: "DELETE", headers: { cookie: await cookie(encargadoId) } }));
    expect(del.status).toBe(200);
    expect(existsSync(path.join(dir, "Pizzas-nuevas.png"))).toBe(false);
    const audit = await getPool().query("select action from gestion_audit_log where action like 'tv_flyer_%' order by id");
    expect(audit.rows.map((r: { action: string }) => r.action)).toEqual(["tv_flyer_upload", "tv_flyer_delete"]);
  });
});
