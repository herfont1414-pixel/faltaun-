import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { createSession, hashPin, SESSION_COOKIE } from "@/lib/admin/auth";
import { addStamp, getLoyalty } from "@/lib/admin/loyalty";
import { importStamps, parseStampList } from "@/lib/admin/loyalty-import";
import { getLoyaltyReport } from "@/lib/admin/loyalty-report";
import { POST as importPost } from "@/app/api/admin/loyalty/import/route";

let dbPath: string;
let adminId: number;
let encargadoId: number;

beforeAll(async () => {
  dbPath = await seedFreshDb("loyalty-import");
  const mk = async (name: string, role: string) =>
    Number((await getPool().query("insert into gestion_users (name, pin_hash, role, active) values ($1, $2, $3, true) returning id", [name, hashPin("4321"), role])).rows[0].id);
  adminId = await mk("Admin I", "admin");
  encargadoId = await mk("Encargado I", "encargado");
});
afterAll(() => tearDownTestDb(dbPath));

const account = async (phone: string) =>
  (await getPool().query("select stamps, name, order_count, total_spent from gestion_loyalty_accounts where phone = $1", [phone])).rows[0];
const grants = async () => Number((await getPool().query("select count(*) as n from gestion_loyalty_grants")).rows[0].n);

describe("carga de sellos que los clientes ya tenían", () => {
  it("lee la lista: separador ; o tabulación, encabezado opcional, gastado con puntos y $", () => {
    const { rows, errors } = parseStampList("Nombre; Teléfono; Sellos; Gastado\nJuan  Pérez; 3755000001; 3; $25.200\nAna\t3755000002\t1\n\n");
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, name: "Juan Pérez", phone: "3755000001", stamps: 3, spent: 25200 },
      { line: 3, name: "Ana", phone: "3755000002", stamps: 1, spent: null },
    ]);
    expect(parseStampList("Juan; 123; 3").errors[0]).toMatch(/teléfono/);
    expect(parseStampList("Juan; 3755000001; 2,5").errors[0]).toMatch(/sellos/);
    expect(parseStampList("Juan; 3755000001").errors[0]).toMatch(/faltan datos/);
  });

  it("la vista previa no guarda nada", async () => {
    const { results } = await importStamps("Juan Pérez; 3755000001; 3; 25200", adminId, { dryRun: true });
    expect(results).toEqual([{ phone: "3755000001", name: "Juan Pérez", before: 0, after: 3, status: "nuevo" }]);
    expect(await account("3755000001")).toBeUndefined();
  });

  it("crea las cuentas con esos sellos, sin premios, y repetir la carga no duplica", async () => {
    // 5 sellos es el hito del premio de papas: no se entrega por sellos anteriores.
    const text = "Juan Pérez; 3755000001; 3; 25200\nAna Gómez; 3755000002; 5\nSin Sellos; 3755000009; 0";
    const before = await grants();
    const { results } = await importStamps(text, adminId);
    expect(results.map((r) => r.status)).toEqual(["nuevo", "nuevo", "sin_cambios"]);
    expect(await account("3755000001")).toMatchObject({ stamps: 3, name: "Juan Pérez", order_count: 3 });
    expect(Number((await account("3755000001")).total_spent)).toBe(25200);
    expect(await account("3755000002")).toMatchObject({ stamps: 5 });
    expect(await account("3755000009")).toBeUndefined();
    expect(await grants()).toBe(before);
    expect((await getLoyalty("3755000002")).rewardsAvailable).toBe(0);

    const again = await importStamps(text, adminId);
    expect(again.results.map((r) => r.status)).toEqual(["sin_cambios", "sin_cambios", "sin_cambios"]);
    expect(await account("3755000001")).toMatchObject({ stamps: 3 });

    const audit = await getPool().query("select user_id from gestion_audit_log where action = 'loyalty_import'");
    expect(audit.rows).toHaveLength(1);
    expect(Number(audit.rows[0].user_id)).toBe(adminId);
  });

  it("encuentra la cuenta aunque el teléfono esté escrito distinto, sube pero nunca baja", async () => {
    const { results } = await importStamps("Juan; 03755000001; 4\nAna; +54 9 3755 00-0002; 2", adminId);
    expect(results).toEqual([
      { phone: "3755000001", name: "Juan Pérez", before: 3, after: 4, status: "actualizado" },
      { phone: "3755000002", name: "Ana Gómez", before: 5, after: 5, status: "sin_cambios" },
    ]);
    expect(await account("3755000001")).toMatchObject({ stamps: 4, name: "Juan Pérez" });
  });

  it("un teléfono repetido en la lista se rechaza entero", async () => {
    const { errors } = await importStamps("Uno; 3755000003; 1\nDos; 03755000003; 2", adminId);
    expect(errors[0]).toMatch(/ya está en la línea 1/);
    expect(await account("3755000003")).toBeUndefined();
  });

  it("después, los sellos nuevos suman y el premio sale al cruzar el hito", async () => {
    // Juan tiene 4: el próximo sello es el 5 (premio de papas).
    const r = await addStamp("3755000001", "pedido-import-1", { orderTotal: 1000 });
    expect(r.stamps).toBe(5);
    expect(r.rewardsAvailable).toBe(1);
  });

  it("el informe no los marca como inconsistentes ni como sellos de empleados", async () => {
    const report = await getLoyaltyReport();
    const phones = (rows: { phone: string }[]) => rows.map((x) => x.phone);
    expect(phones(report.consistency.mismatched)).not.toContain("3755000001");
    expect(phones(report.consistency.withoutHistory)).not.toContain("3755000002");
  });

  it("solo el administrador puede cargar (encargado no)", async () => {
    const req = async (userId: number | null, body: unknown) =>
      new NextRequest("http://localhost/api/admin/loyalty/import", {
        method: "POST",
        headers: { "content-type": "application/json", ...(userId ? { cookie: `${SESSION_COOKIE}=${await createSession(userId)}` } : {}) },
        body: JSON.stringify(body),
      });
    const body = { text: "Leo; 3755000004; 2", confirm: true };
    expect((await importPost(await req(null, body))).status).toBe(401);
    expect((await importPost(await req(encargadoId, body))).status).toBe(401);
    expect(await account("3755000004")).toBeUndefined();

    const preview = await importPost(await req(adminId, { text: body.text }));
    expect(preview.status).toBe(200);
    expect((await preview.json()).saved).toBe(false);
    expect(await account("3755000004")).toBeUndefined();

    const res = await importPost(await req(adminId, body));
    expect(res.status).toBe(200);
    expect((await res.json()).saved).toBe(true);
    expect(await account("3755000004")).toMatchObject({ stamps: 2 });

    const bad = await importPost(await req(adminId, { text: "Leo; 12; 2", confirm: true }));
    expect(bad.status).toBe(400);
  });
});
