import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { createSession, hashPin, SESSION_COOKIE } from "@/lib/admin/auth";
import { POST as loginPost } from "@/app/api/admin/login/route";
import { GET as lanGet } from "@/app/api/admin/lan-info/route";
import { lanAddresses } from "@/lib/admin/lan";

let dbPath: string;
let mozoId: number;

beforeAll(async () => {
  dbPath = await seedFreshDb("phone-access");
  mozoId = Number((await getPool().query("insert into gestion_users (name, pin_hash, role, active) values ('Mozo Cel', $1, 'mozo', true) returning id", [hashPin("8080")])).rows[0].id);
});
afterAll(() => tearDownTestDb(dbPath));

const login = (url: string, headers: Record<string, string> = {}) =>
  loginPost(new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ pin: "8080" }) }));

describe("usar el panel desde el celular (Wi-Fi del local)", () => {
  it("por http (celular → IP de la PC) el cookie de sesión no lleva 'secure', así el navegador lo guarda", async () => {
    const res = await login("http://192.168.0.10:3000/api/admin/login");
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie.toLowerCase()).not.toContain("secure");
  });

  it("con candado (https o detrás de Vercel/Caddy) sí lleva 'secure'; COOKIE_SECURE lo fuerza", async () => {
    expect((await login("https://madero.ejemplo.com/api/admin/login")).headers.get("set-cookie")!.toLowerCase()).toContain("secure");
    expect((await login("http://interno/api/admin/login", { "x-forwarded-proto": "https" })).headers.get("set-cookie")!.toLowerCase()).toContain("secure");
    process.env.COOKIE_SECURE = "false";
    expect((await login("https://madero.ejemplo.com/api/admin/login")).headers.get("set-cookie")!.toLowerCase()).not.toContain("secure");
    process.env.COOKIE_SECURE = "true";
    expect((await login("http://192.168.0.10:3000/api/admin/login")).headers.get("set-cookie")!.toLowerCase()).toContain("secure");
    delete process.env.COOKIE_SECURE;
  });

  it("la dirección para los celulares solo la ve alguien logueado", async () => {
    expect((await lanGet(new NextRequest("http://localhost/api/admin/lan-info"))).status).toBe(401);
    const res = await lanGet(
      new NextRequest("http://localhost/api/admin/lan-info", { headers: { cookie: `${SESSION_COOKIE}=${await createSession(mozoId)}` } })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.addresses)).toBe(true);
    for (const a of data.addresses) expect(a).toMatch(/^http:\/\/\d+\.\d+\.\d+\.\d+:\d+\/admin$/);
    if (data.addresses.length) expect(data.qr).toContain("<svg");
    for (const a of lanAddresses(3000)) expect(a).not.toMatch(/127\.0\.0\.1|169\.254\./);
  });
});
