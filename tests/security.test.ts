import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { anyInStockProduct, nextDay, seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { hashPin } from "@/lib/admin/auth";
import { addStamp } from "@/lib/admin/loyalty";
import { POST as loginPost } from "@/app/api/admin/login/route";
import { GET as customerGet } from "@/app/api/customer/[phone]/route";
import { GET as loyaltyGet } from "@/app/api/customer/[phone]/loyalty/route";
import { GET as ordersGet } from "@/app/api/customer/[phone]/orders/route";
import { POST as ordersPost } from "@/app/api/orders/route";

let dbPath: string;
const GOOD_PIN = "482913";

beforeAll(async () => {
  dbPath = await seedFreshDb("security");
  await getPool().query("insert into gestion_users (name, pin_hash, role, active) values ('Dueño', $1, 'admin', true)", [hashPin(GOOD_PIN)]);
});
afterAll(() => tearDownTestDb(dbPath));

function login(pin: string, ip: string) {
  return loginPost(
    new NextRequest("http://localhost/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: JSON.stringify({ pin }),
    })
  );
}
const get = (path: string, ip: string) => new NextRequest(`http://localhost${path}`, { headers: { "x-real-ip": ip } });

describe("login: freno contra probar PINs", () => {
  it("después de 5 PIN incorrectos, la misma conexión queda bloqueada (aunque después acierte)", async () => {
    const ip = "10.0.0.1";
    for (let i = 0; i < 5; i++) expect((await login("000000", ip)).status).toBe(401);
    const blocked = await login(GOOD_PIN, ip);
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/Demasiados intentos.*minuto/);
    // Otra conexión no está bloqueada.
    expect((await login(GOOD_PIN, "10.0.0.2")).status).toBe(200);
  });

  it("un login correcto borra los fallos anteriores de esa conexión", async () => {
    const ip = "10.0.0.3";
    for (let i = 0; i < 3; i++) await login("111111", ip);
    expect((await login(GOOD_PIN, ip)).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login("111111", ip)).status).toBe(401);
    expect((await login(GOOD_PIN, ip)).status).toBe(200);
  });

  it("muchos intentos en paralelo no pasan el tope: como mucho 5 se evalúan", async () => {
    const ip = "10.0.0.4";
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => login(String(100000 + i), ip)));
    const evaluated = results.filter((r) => r.status === 401).length;
    expect(evaluated).toBeLessThanOrEqual(5);
    expect(results.filter((r) => r.status === 429).length).toBeGreaterThanOrEqual(20);
  });

  it("los intentos fallidos y los bloqueos quedan en la auditoría", async () => {
    const { rows } = await getPool().query(
      "select action, count(*) as n from gestion_audit_log where action in ('login_failed', 'login_blocked') group by action order by action"
    );
    const byAction = Object.fromEntries(rows.map((r: any) => [r.action, Number(r.n)]));
    expect(byAction.login_failed).toBeGreaterThan(0);
    expect(byAction.login_blocked).toBeGreaterThan(0);
  });
});

describe("datos públicos: escribir un teléfono ajeno no muestra datos personales", () => {
  it("la consulta de cliente ya no devuelve nombre ni dirección", async () => {
    await getPool().query(
      "insert into gestion_delivery_customers (phone, name, address) values ('5493755111222', 'María Pérez', 'San Martín 123')"
    );
    const res = await customerGet();
    expect(await res.json()).toEqual({ customer: null });
  });

  it("la tarjeta pública muestra sellos y premios, sin nombre, teléfono, pedidos ni gasto", async () => {
    const phone = "5493755111333";
    await addStamp(phone, "priv-1", { name: "Juana Secreta", orderTotal: 98765, now: nextDay() });
    const res = await loyaltyGet(get(`/api/customer/${phone}/loyalty`, "10.1.0.1"), { params: { phone } });
    const body = await res.json();
    expect(body.account.stamps).toBe(1);
    const text = JSON.stringify(body);
    expect(text).not.toContain("Juana");
    expect(text).not.toContain("98765");
    expect(body.account).not.toHaveProperty("name");
    expect(body.account).not.toHaveProperty("phone");
    expect(body.account).not.toHaveProperty("totalSpent");
    expect(body.account).not.toHaveProperty("orderCount");
  });
});

describe("límites de uso de las rutas públicas", () => {
  it("consultar el MISMO teléfono muchas veces (pantalla que se refresca) no se bloquea", async () => {
    const ip = "10.2.0.1";
    const phone = "5493755000001";
    for (let i = 0; i < 80; i++) {
      const res = await ordersGet(get(`/api/customer/${phone}/orders`, ip), { params: { phone } });
      expect(res.status).toBe(200);
    }
  });

  it("barrer muchos teléfonos distintos desde una conexión se frena (y no afecta a otra conexión)", async () => {
    const ip = "10.2.0.2";
    const statuses: number[] = [];
    for (let i = 0; i < 35; i++) {
      const phone = `54937550${String(i).padStart(5, "0")}`;
      statuses.push((await loyaltyGet(get(`/api/customer/${phone}/loyalty`, ip), { params: { phone } })).status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(30).every((s) => s === 429)).toBe(true);
    // Un número ya consultado desde esa conexión sigue andando (es su propia tarjeta refrescándose).
    const own = "5493755000000";
    expect((await loyaltyGet(get(`/api/customer/${own}/loyalty`, ip), { params: { phone: own } })).status).toBe(200);
    const other = "5493755099999";
    expect((await loyaltyGet(get(`/api/customer/${other}/loyalty`, "10.2.0.3"), { params: { phone: other } })).status).toBe(200);
  });

  it("muchos pedidos web seguidos desde una conexión se frenan", async () => {
    const product = await anyInStockProduct();
    const ip = "10.3.0.1";
    const order = (n: number) =>
      ordersPost(
        new NextRequest("http://localhost/api/orders", {
          method: "POST",
          headers: { "content-type": "application/json", "x-real-ip": ip },
          body: JSON.stringify({
            customerName: `Cliente ${n}`,
            customerPhone: "5493755222000",
            items: [{ name: product.name, qty: 1 }],
            fulfillment: "retiro",
            paymentMethod: "efectivo",
          }),
        })
      );
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await order(i)).status);
    expect(statuses.slice(0, 10).every((s) => s === 200 || s === 201)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });
});
