import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import {
  createSession,
  getSessionUser,
  requireUser,
  hashPin,
  verifyPin,
  SESSION_COOKIE,
} from "@/lib/admin/auth";
import { createUser } from "@/lib/admin/users";

let dbPath: string;

function requestWithCookie(token: string | null) {
  return new NextRequest("http://localhost/api/admin/state", {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
  });
}

beforeAll(async () => {
  dbPath = await seedFreshDb("auth");
});

afterAll(() => {
  tearDownTestDb(dbPath);
});

describe("hashPin / verifyPin", () => {
  it("nunca guarda el PIN en texto plano y verifica correctamente", () => {
    const hash = hashPin("1234");
    expect(hash).not.toContain("1234");
    expect(verifyPin("1234", hash)).toBe(true);
    expect(verifyPin("9999", hash)).toBe(false);
  });
});

describe("login válido / inválido", () => {
  it("PIN correcto crea una sesión cuyo token nunca es el PIN", async () => {
    const user = await createUser({ name: "Mozo Test", pin: "5566", role: "mozo" });
    const token = await createSession(user.id);
    expect(token).not.toBe("5566");
    expect(token.length).toBeGreaterThan(20);

    const sessionUser = await getSessionUser(token);
    expect(sessionUser?.id).toBe(user.id);
    expect(sessionUser?.role).toBe("mozo");
  });

  it("PIN incorrecto no genera ninguna sesión válida", async () => {
    const result = await getSessionUser("token-que-no-existe");
    expect(result).toBeNull();
  });
});

describe("rol sin permiso", () => {
  it("requireUser con roles permitidos rechaza un rol que no está en la lista", async () => {
    const mozo = await createUser({ name: "Mozo Permisos", pin: "7788", role: "mozo" });
    const token = await createSession(mozo.id);
    const request = requestWithCookie(token);

    const asAnyRole = await requireUser(request);
    expect(asAnyRole?.role).toBe("mozo");

    const asAdminOnly = await requireUser(request, ["admin", "encargado"]);
    expect(asAdminOnly).toBeNull();
  });

  it("un admin sí pasa el mismo chequeo de rol", async () => {
    const admin = await createUser({ name: "Admin Permisos", pin: "9900", role: "admin" });
    const token = await createSession(admin.id);
    const request = requestWithCookie(token);

    const asAdminOnly = await requireUser(request, ["admin", "encargado"]);
    expect(asAdminOnly?.role).toBe("admin");
  });
});

describe("sesión vencida", () => {
  it("una sesión con expires_at en el pasado ya no es válida", async () => {
    const user = await createUser({ name: "Vencido", pin: "1122", role: "mozo" });
    const token = await createSession(user.id);

    expect(await getSessionUser(token)).not.toBeNull();

    const pool = getPool();
    await pool.query("update gestion_sessions set expires_at = $1 where token = $2", [
      new Date(Date.now() - 1000).toISOString(),
      token,
    ]);

    expect(await getSessionUser(token)).toBeNull();
    const request = requestWithCookie(token);
    expect(await requireUser(request)).toBeNull();
  });

  it("sin cookie de sesión, requireUser rechaza directamente", async () => {
    const request = requestWithCookie(null);
    expect(await requireUser(request)).toBeNull();
  });
});
