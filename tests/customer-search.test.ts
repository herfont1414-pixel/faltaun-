import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { anyInStockProduct, seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { createSession, hashPin, SESSION_COOKIE } from "@/lib/admin/auth";
import { addItem, createDeliveryOrder, finalizeOrder } from "@/lib/admin/store";
import { addStamp } from "@/lib/admin/loyalty";
import { listCustomerDirectory } from "@/lib/admin/crm";
import { matchCustomers } from "@/lib/admin/customer-match";
import type { DirectoryCustomer } from "@/lib/admin/crm";
import { GET as directoryGet } from "@/app/api/admin/customer-directory/route";

let dbPath: string;
beforeAll(async () => {
  dbPath = await seedFreshDb("customer-search");
});
afterAll(() => tearDownTestDb(dbPath));

const c = (name: string, phone: string | null, orders = 0): DirectoryCustomer => ({
  name, phone, address: null, orders, spent: orders * 1000, stamps: 0, lastOrderAt: null, ccBalance: null,
});

describe("buscador de clientes al cargar un pedido", () => {
  const list = [
    c("Pedro Gómez", "3755 41-1111", 2),
    c("Pedro Alvarez", "3755 41-2222", 9),
    c("María Pérez", "3755 41-3333", 1),
    c("PEPO", null),
    c("Tedy Ruppel", "3755 49-8877", 3),
  ];

  it("sugiere por el comienzo de cada palabra, sin importar tildes ni mayúsculas", () => {
    expect(matchCustomers(list, "p").map((x) => x.name)).toEqual([]); // con 1 letra no molesta
    expect(matchCustomers(list, "pe").map((x) => x.name)).toEqual(["Pedro Alvarez", "Pedro Gómez", "PEPO", "María Pérez"]);
    expect(matchCustomers(list, "ped go").map((x) => x.name)).toEqual(["Pedro Gómez"]);
    expect(matchCustomers(list, "maria perez").map((x) => x.name)).toEqual(["María Pérez"]);
    expect(matchCustomers(list, "ruppel").map((x) => x.name)).toEqual(["Tedy Ruppel"]);
    expect(matchCustomers(list, "zz")).toEqual([]);
  });

  it("con números busca por teléfono", () => {
    expect(matchCustomers(list, "8877").map((x) => x.name)).toEqual(["Tedy Ruppel"]);
    expect(matchCustomers(list, "41-22").map((x) => x.name)).toEqual(["Pedro Alvarez"]);
  });

  it("la lista trae las compras del cliente (cobradas en el panel y de fidelidad) y los de Fudo sin teléfono", async () => {
    const p = await anyInStockProduct();
    const o = await createDeliveryOrder({ name: "Tedy Ruppel", phone: "3755 49-8877", address: "San Martín 100", zone: null, shippingCost: 0, channel: "whatsapp" });
    await addItem(o.id, p.id);
    await finalizeOrder(o.id, [{ method: "efectivo", amount: p.price } as never], null, null);
    await addStamp("3755 49-0000", "web-1", { orderTotal: 5000, name: "Lucía Web" });

    const dir = await listCustomerDirectory();
    const tedy = dir.find((x) => x.phone === "3755 49-8877")!;
    expect(tedy).toMatchObject({ name: "Tedy Ruppel", address: "San Martín 100", orders: 1, spent: p.price });
    expect(tedy.lastOrderAt).toBeTruthy();
    expect(dir.find((x) => x.phone === "3755 49-0000")).toMatchObject({ name: "Lucía Web", orders: 1, spent: 5000, stamps: 1 });
    // Los clientes de Fudo sin teléfono (cuenta corriente) también se encuentran por nombre.
    expect(dir.some((x) => x.phone === null && x.name === "PEPO")).toBe(true);
  });

  it("la ruta pide sesión", async () => {
    expect((await directoryGet(new NextRequest("http://localhost/api/admin/customer-directory"))).status).toBe(401);
    const id = Number((await getPool().query("insert into gestion_users (name, pin_hash, role, active) values ('Mozo S', $1, 'mozo', true) returning id", [hashPin("2468")])).rows[0].id);
    const res = await directoryGet(
      new NextRequest("http://localhost/api/admin/customer-directory", { headers: { cookie: `${SESSION_COOKIE}=${await createSession(id)}` } })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).customers.length).toBeGreaterThan(100);
  });
});
