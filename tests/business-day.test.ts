import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from "vitest";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { startOfBusinessDay } from "@/lib/admin/business-day";
import { getDashboardSummary } from "@/lib/admin/dashboard";

describe("día del local (Argentina, UTC-3)", () => {
  it("a las 22:34 del local (01:34 UTC del día siguiente) el día sigue siendo el de hoy", () => {
    // 2026-10-08 22:34 en Argentina = 2026-10-09 01:34 UTC
    const start = startOfBusinessDay(new Date("2026-10-09T01:34:00Z"));
    expect(start.toISOString()).toBe("2026-10-08T03:00:00.000Z"); // 00:00 del 8/10 en Argentina
  });

  it("justo después de medianoche del local arranca el día nuevo", () => {
    expect(startOfBusinessDay(new Date("2026-10-09T03:00:00Z")).toISOString()).toBe("2026-10-09T03:00:00.000Z");
    expect(startOfBusinessDay(new Date("2026-10-09T02:59:59Z")).toISOString()).toBe("2026-10-08T03:00:00.000Z");
  });

  it("da lo mismo sin importar la zona horaria del servidor", () => {
    const instant = new Date("2026-10-09T01:34:00Z");
    const results = new Set<string>();
    for (const tz of ["UTC", "America/Argentina/Buenos_Aires", "Asia/Tokyo", "America/Los_Angeles"]) {
      process.env.TZ = tz;
      results.add(startOfBusinessDay(instant).toISOString());
    }
    delete process.env.TZ;
    expect([...results]).toEqual(["2026-10-08T03:00:00.000Z"]);
  });
});

describe("tablero de Inicio: las ventas de hoy no dependen de dónde corre el servidor", () => {
  let dbPath: string;

  beforeAll(async () => {
    dbPath = await seedFreshDb("businessday");
    const pool = getPool();
    // Dos ventas cerradas de la tarde del 8/10 (17:00 y 19:00 en Argentina)
    for (const [id, closedAt] of [
      ["aaaaaaaa-0000-0000-0000-000000000001", "2026-10-08T20:00:00.000Z"],
      ["aaaaaaaa-0000-0000-0000-000000000002", "2026-10-08T22:00:00.000Z"],
    ]) {
      await pool.query(
        "insert into gestion_orders (id, origin, status, total, payment_method, closed_at) values ($1, 'mostrador', 'cerrada', 28500, 'efectivo', $2)",
        [id, closedAt]
      );
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TZ;
  });

  afterAll(() => tearDownTestDb(dbPath));

  for (const tz of ["UTC", "America/Argentina/Buenos_Aires"]) {
    it(`a las 22:34 del local, con el servidor en ${tz}: 2 pedidos y ticket promedio $28.500`, async () => {
      process.env.TZ = tz;
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-09T01:34:00Z"));
      const summary = await getDashboardSummary();
      expect(summary.pedidosHoy).toBe(2);
      expect(summary.ventasHoy).toBe(57000);
      expect(summary.ticketPromedio).toBe(28500);
    });
  }
});
