import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { createSession, hashPin, SESSION_COOKIE } from "@/lib/admin/auth";
import {
  assignReservationTable,
  createPanelReservation,
  createReservation,
  listUpcomingReservations,
  respondReservation,
} from "@/lib/admin/reservations";
import { POST as reservationsPost, GET as reservationsGet } from "@/app/api/admin/reservations/route";
import { PATCH as reservationPatch } from "@/app/api/admin/reservations/[id]/route";

let dbPath: string;
let mozoId: number;
let cocinaId: number;
const NOW = new Date("2030-03-10T15:00:00Z"); // 10/03/2030 12:00 en Argentina

beforeAll(async () => {
  dbPath = await seedFreshDb("reservations-panel");
  const mk = async (name: string, role: string) =>
    Number((await getPool().query("insert into gestion_users (name, pin_hash, role, active) values ($1, $2, $3, true) returning id", [name, hashPin("4321"), role])).rows[0].id);
  mozoId = await mk("Mozo R", "mozo");
  cocinaId = await mk("Cocina R", "cocina");
});
afterAll(() => tearDownTestDb(dbPath));

const base = { customerName: "Familia Gómez", customerPhone: "3755 41-1111", partySize: 4, date: "2030-03-10", time: "21:00" };

describe("reservas cargadas desde el panel", () => {
  it("quedan confirmadas, con mesa, origen panel y quién la cargó (auditado)", async () => {
    const r = await createPanelReservation({ ...base, tableNumber: 5, notes: "Cumpleaños" }, mozoId, NOW);
    expect(r).toMatchObject({ status: "confirmada", tableNumber: 5, source: "panel", partySize: 4, notes: "Cumpleaños" });
    const { rows } = await getPool().query("select created_by, responded_at from gestion_reservations where id = $1", [r.id]);
    expect(Number(rows[0].created_by)).toBe(mozoId);
    expect(rows[0].responded_at).toBeTruthy();
    const audit = await getPool().query("select 1 from gestion_audit_log where action = 'reservation_create' and entity_id = $1", [r.id]);
    expect(audit.rows).toHaveLength(1);
  });

  it("valida los datos", async () => {
    await expect(createPanelReservation({ ...base, customerName: "  " }, mozoId, NOW)).rejects.toThrow(/nombre/);
    await expect(createPanelReservation({ ...base, partySize: 0 }, mozoId, NOW)).rejects.toThrow(/personas/);
    await expect(createPanelReservation({ ...base, time: "25:00" }, mozoId, NOW)).rejects.toThrow(/Hora inválida/);
    await expect(createPanelReservation({ ...base, date: "2030-03-09" }, mozoId, NOW)).rejects.toThrow(/ya pasó/);
    await expect(createPanelReservation({ ...base, tableNumber: 999 }, mozoId, NOW)).rejects.toThrow(/no existe/);
    // Sin teléfono también se puede (reserva tomada en persona).
    const r = await createPanelReservation({ ...base, customerPhone: "", time: "13:00" }, mozoId, NOW);
    expect(r.customerPhone).toBe("");
  });

  it("no deja reservar la misma mesa con menos de 2 horas de diferencia", async () => {
    await expect(createPanelReservation({ ...base, customerName: "Otro", time: "22:30", tableNumber: 5 }, mozoId, NOW)).rejects.toThrow(
      /mesa 5 ya tiene una reserva a las 21:00 \(Familia Gómez\)/
    );
    // A las 23:00 (2 h después) sí; otro día también.
    await createPanelReservation({ ...base, customerName: "Tarde", time: "23:00", tableNumber: 5 }, mozoId, NOW);
    await createPanelReservation({ ...base, customerName: "Mañana", date: "2030-03-11", tableNumber: 5 }, mozoId, NOW);
  });

  it("una reserva cancelada libera la mesa", async () => {
    const r = await createPanelReservation({ ...base, customerName: "Cancela", time: "20:00", tableNumber: 6 }, mozoId, NOW);
    await respondReservation(r.id, "rechazada");
    await createPanelReservation({ ...base, customerName: "Ocupa", time: "20:30", tableNumber: 6 }, mozoId, NOW);
  });

  it("asignar mesa a una reserva existente controla choques y no choca consigo misma", async () => {
    const web = await createReservation({ ...base, customerName: "Desde la web", time: "21:30", notes: null });
    expect(web.source).toBe("web");
    expect(web.status).toBe("pendiente");
    await expect(assignReservationTable(web.id, 5)).rejects.toThrow(/mesa 5 ya tiene/);
    await assignReservationTable(web.id, 7);
    await assignReservationTable(web.id, 7); // otra vez la misma: no choca consigo misma
    await assignReservationTable(web.id, null);
  });

  it("próximas: solo confirmadas desde hoy, ordenadas por fecha y hora", async () => {
    await getPool().query(
      "insert into gestion_reservations (customer_name, customer_phone, party_size, reservation_date, reservation_time, status) values ('Vieja', '', 2, '2030-03-01', '21:00', 'confirmada')"
    );
    const list = await listUpcomingReservations(NOW);
    expect(list.every((r) => r.status === "confirmada" && r.date >= "2030-03-10")).toBe(true);
    expect(list.map((r) => `${r.date} ${r.time}`)).toEqual([...list.map((r) => `${r.date} ${r.time}`)].sort());
    expect(list.some((r) => r.customerName === "Vieja")).toBe(false);
    expect(list.some((r) => r.customerName === "Desde la web")).toBe(false); // pendiente
  });

  it("API: mozos pueden crear, cocina no; errores claros; asignar mesa por PATCH", async () => {
    const req = async (userId: number | null, method: string, url: string, body?: unknown) =>
      new NextRequest(`http://localhost${url}`, {
        method,
        headers: { "content-type": "application/json", ...(userId ? { cookie: `${SESSION_COOKIE}=${await createSession(userId)}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    const future = { ...base, date: "2099-12-31", time: "21:00", tableNumber: 3 };
    expect((await reservationsPost(await req(null, "POST", "/api/admin/reservations", future))).status).toBe(401);
    expect((await reservationsPost(await req(cocinaId, "POST", "/api/admin/reservations", future))).status).toBe(401);
    const ok = await reservationsPost(await req(mozoId, "POST", "/api/admin/reservations", future));
    expect(ok.status).toBe(200);
    const created = (await ok.json()).reservation;
    const clash = await reservationsPost(await req(mozoId, "POST", "/api/admin/reservations", { ...future, customerName: "Choca" }));
    expect(clash.status).toBe(400);
    expect((await clash.json()).error).toMatch(/mesa 3 ya tiene/);

    const upcoming = await (await reservationsGet(await req(mozoId, "GET", "/api/admin/reservations?scope=upcoming"))).json();
    expect(upcoming.reservations.some((r: { id: string }) => r.id === created.id)).toBe(true);

    const patch = await reservationPatch(await req(mozoId, "PATCH", `/api/admin/reservations/${created.id}`, { tableNumber: 4 }), { params: { id: created.id } });
    expect(patch.status).toBe(200);
    const bad = await reservationPatch(await req(mozoId, "PATCH", `/api/admin/reservations/${created.id}`, { status: "inventado" }), { params: { id: created.id } });
    expect(bad.status).toBe(400);
  });
});
