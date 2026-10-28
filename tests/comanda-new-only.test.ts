import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { anyInStockProduct, seedFreshDb, tearDownTestDb } from "./helpers";
import { getPool } from "@/lib/admin/db";
import { createSession, hashPin, SESSION_COOKIE } from "@/lib/admin/auth";
import { addItem, getState, openTable, sendToKitchen, setQty } from "@/lib/admin/store";
import { getPrintableOrder, markComandaPrinted } from "@/lib/admin/print";
import { renderComandaEscPos } from "@/lib/admin/escpos";
import { renderComandaHtml, toComandaPrintData } from "@/lib/admin/print-templates";
import { GET as comandaGet } from "@/app/api/admin/print/comanda/[orderId]/route";
import { POST as directPost } from "@/app/api/admin/print-direct/route";
import type { PrintConfig } from "@/lib/admin/types";

let dbPath: string;
let userId: number;
let p1: { id: number; name: string };
let p2: { id: number; name: string };

const config: PrintConfig = {
  paperWidthMm: 58, headerText: "", footerText: "", paperSavingMode: false,
  fontSizeHeader: "normal", fontSizeBody: "normal", fontSizeFooter: "normal", directPrintEnabled: false, printerName: "",
};

beforeAll(async () => {
  dbPath = await seedFreshDb("comanda-new-only");
  p1 = await anyInStockProduct();
  p2 = { id: Number((await getPool().query("select id from gestion_products where name = 'Papas Fritas'")).rows[0].id), name: "Papas Fritas" };
  userId = Number((await getPool().query("insert into gestion_users (name, pin_hash, role, active) values ('Mozo N', $1, 'mozo', true) returning id", [hashPin("1357")])).rows[0].id);
});
afterAll(() => tearDownTestDb(dbPath));

const names = (o: Awaited<ReturnType<typeof getPrintableOrder>>) => o.items.map((i) => `${i.qty} ${i.name}`);
const printed = async (orderId: string) =>
  (await getPool().query("select product_name, comanda_printed_qty from gestion_order_items where order_id = $1 order by product_name", [orderId])).rows.map(
    (r: any) => `${r.product_name}:${Number(r.comanda_printed_qty)}`
  );

describe("comanda: solo lo nuevo", () => {
  it("la primera comanda lleva todo; después de imprimirla, lo agregado sale solo y con el rótulo AGREGADO", async () => {
    const order = await openTable(11, { partySize: 2 });
    await addItem(order.id, p1.id);
    await sendToKitchen(order.id);

    const first = await getPrintableOrder(order.id);
    expect(names(first)).toEqual([`1 ${p1.name}`]);
    expect(first.addition).toBe(false);
    await markComandaPrinted(order.id, first.items.map((i) => ({ id: i.id, qty: i.qty })));

    await addItem(order.id, p2.id);
    await addItem(order.id, p2.id);
    await sendToKitchen(order.id);
    const second = await getPrintableOrder(order.id);
    expect(names(second)).toEqual([`2 ${p2.name}`]);
    expect(second.addition).toBe(true);

    const escpos = renderComandaEscPos(toComandaPrintData(second), config).toString("latin1");
    expect(escpos).toContain("** AGREGADO **");
    expect(escpos).toContain(p2.name.toUpperCase().slice(0, 8));
    expect(escpos).not.toContain(p1.name.toUpperCase().slice(0, 10));
    expect(renderComandaHtml(toComandaPrintData(second), config)).toContain("** AGREGADO **");
    // La primera no lleva rótulo.
    expect(renderComandaEscPos(toComandaPrintData(first), config).toString("latin1")).not.toContain("AGREGADO");
  });

  it("reimpresión completa: devuelve todo lo enviado y no lleva rótulo", async () => {
    const order = (await getState()).openOrders.find((o) => o.tableNumber === 11)!;
    const all = await getPrintableOrder(order.id, { all: true });
    expect(names(all).sort()).toEqual([`1 ${p1.name}`, `2 ${p2.name}`].sort());
    expect(all.addition).toBe(false);
  });

  it("un producto nuevo cargado pero NO enviado a cocina no sale en la comanda", async () => {
    const order = (await getState()).openOrders.find((o) => o.tableNumber === 11)!;
    await markComandaPrinted(order.id, (await getPrintableOrder(order.id)).items.map((i) => ({ id: i.id, qty: i.qty })));
    const p3 = Number((await getPool().query("select id from gestion_products where name = 'Burger Bacon'")).rows[0].id);
    await addItem(order.id, p3); // línea nueva, todavía sin "Enviar a cocina"
    expect((await getPrintableOrder(order.id)).items).toEqual([]);
  });

  it("si mientras se imprime se agrega otro producto, ese queda pendiente (se marcan solo los impresos)", async () => {
    const order = await openTable(12);
    await addItem(order.id, p1.id);
    await sendToKitchen(order.id);
    const rendered = await getPrintableOrder(order.id); // lo que se está imprimiendo
    await addItem(order.id, p2.id);
    await sendToKitchen(order.id); // llega otro envío antes de terminar
    await markComandaPrinted(order.id, rendered.items.map((i) => ({ id: i.id, qty: i.qty })));
    expect(await printed(order.id)).toEqual([`${p1.name}:1`, `${p2.name}:0`].sort());
    expect(names(await getPrintableOrder(order.id))).toEqual([`1 ${p2.name}`]);
  });

  it("el panel recibe cuántas unidades de cada producto ya salieron impresas", async () => {
    const order = (await getState()).openOrders.find((o) => o.tableNumber === 12)!;
    expect(order.items.map((i) => [i.name, i.qty, i.comandaPrintedQty])).toEqual(
      expect.arrayContaining([[p1.name, 1, 1], [p2.name, 1, 0]])
    );
  });

  it("piden OTRA unidad de lo mismo que ya salió: la comanda lleva solo esa unidad", async () => {
    const order = await openTable(15);
    await addItem(order.id, p2.id);
    await addItem(order.id, p2.id); // 2 papas
    await sendToKitchen(order.id);
    const first = await getPrintableOrder(order.id);
    expect(names(first)).toEqual([`2 ${p2.name}`]);
    await markComandaPrinted(order.id, first.items.map((i) => ({ id: i.id, qty: i.qty })));
    expect(await printed(order.id)).toEqual([`${p2.name}:2`]);

    await addItem(order.id, p2.id); // vuelven a pedir 1 más → la línea queda en 3
    await sendToKitchen(order.id);
    const second = await getPrintableOrder(order.id);
    expect(names(second)).toEqual([`1 ${p2.name}`]);
    expect(second.addition).toBe(true);
    await markComandaPrinted(order.id, second.items.map((i) => ({ id: i.id, qty: i.qty })));
    expect(await printed(order.id)).toEqual([`${p2.name}:3`]);
    expect((await getPrintableOrder(order.id)).items).toEqual([]);
    // La reimpresión completa trae las 3.
    expect(names(await getPrintableOrder(order.id, { all: true }))).toEqual([`3 ${p2.name}`]);
  });

  it("si se baja la cantidad ya impresa y se vuelve a subir, la unidad nueva sí sale", async () => {
    const order = (await getState()).openOrders.find((o) => o.tableNumber === 15)!;
    const itemId = order.items[0].id; // 3 papas, 3 impresas
    await setQty(order.id, itemId, -2); // quedan 1 (se anularon 2)
    expect(await printed(order.id)).toEqual([`${p2.name}:1`]);
    await setQty(order.id, itemId, 1); // piden 1 de nuevo → 2 en total, 1 impresa
    await sendToKitchen(order.id);
    expect(names(await getPrintableOrder(order.id))).toEqual([`1 ${p2.name}`]);
  });
});

describe("rutas de impresión", () => {
  const cookie = async () => `${SESSION_COOKIE}=${await createSession(userId)}`;

  it("navegador: imprime lo nuevo y lo marca; sin nada nuevo responde 204; ?all=1 reimprime todo", async () => {
    const order = await openTable(13);
    await addItem(order.id, p1.id);
    await sendToKitchen(order.id);
    const call = async (q = "") =>
      comandaGet(new NextRequest(`http://localhost/api/admin/print/comanda/${order.id}${q}`, { headers: { cookie: await cookie() } }), { params: { orderId: order.id } });

    const first = await call();
    expect(first.status).toBe(200);
    expect(await first.text()).toContain(p1.name.toUpperCase());
    expect(await printed(order.id)).toEqual([`${p1.name}:1`]);

    expect((await call()).status).toBe(204);

    const all = await call("?all=1");
    expect(all.status).toBe(200);
    expect(await all.text()).toContain(p1.name.toUpperCase());
  });

  it("impresión directa: sin nada nuevo responde nothing_new, y no marca nada si no sale por la impresora", async () => {
    const order = await openTable(14);
    await addItem(order.id, p1.id);
    await sendToKitchen(order.id);
    const direct = async (body: unknown) =>
      directPost(
        new NextRequest("http://localhost/api/admin/print-direct", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: await cookie() },
          body: JSON.stringify(body),
        })
      );
    // Impresión directa no configurada (not_configured): el navegador la imprime después.
    expect(await (await direct({ type: "comanda", orderId: order.id })).json()).toMatchObject({ ok: false, reason: "not_configured" });
    expect(await printed(order.id)).toEqual([`${p1.name}:0`]);

    await markComandaPrinted(order.id, (await getPrintableOrder(order.id)).items.map((i) => ({ id: i.id, qty: i.qty })));
    expect(await (await direct({ type: "comanda", orderId: order.id })).json()).toEqual({ ok: false, reason: "nothing_new" });
    // La reimpresión completa sí sigue adelante (acá, hasta not_configured).
    expect(await (await direct({ type: "comanda", orderId: order.id, all: true })).json()).toMatchObject({ reason: "not_configured" });
  });
});
