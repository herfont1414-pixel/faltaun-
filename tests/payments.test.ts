import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { seedFreshDb, tearDownTestDb } from "./helpers";
import { openTable, addItem, finalizeOrder, getState, updateProduct } from "@/lib/admin/store";
import { openShift, getCurrentShift } from "@/lib/admin/shifts";
import { getPool } from "@/lib/admin/db";
import { changeCents, normalizePayments, toCents } from "@/lib/admin/payments";
import { getPrintableTicket } from "@/lib/admin/print";
import { renderTicketEscPos } from "@/lib/admin/escpos";
import { renderTicketHtml } from "@/lib/admin/print-templates";
import type { PrintConfig } from "@/lib/admin/types";
import type { OrderPayment } from "@/lib/admin/types";

let dbPath: string;
let tableCounter = 0;

// Productos reales del catálogo semilla: Papas Chedar $8.000, Burger American
// $8.500 y Papas Fritas $7.500. Se fuerzan disponibles y sin stock numérico
// para que estos tests prueben pagos y no stock.
const PAPAS_CHEDAR = "Papas Chedar";
const BURGER_AMERICAN = "Burger American";
const PAPAS_FRITAS = "Papas Fritas";

async function productByName(name: string) {
  const state = await getState();
  const product = Object.values(state.catalog)
    .flat()
    .find((p) => p.name === name)!;
  await updateProduct(product.id, { active: true, inStock: true, stockQty: null });
  return product;
}

// Abre una mesa nueva con los productos pedidos y devuelve el pedido y su total.
async function orderWith(...names: string[]) {
  tableCounter += 1;
  const order = await openTable(tableCounter, {});
  let total = 0;
  for (const name of names) {
    const product = await productByName(name);
    await addItem(order.id, product.id);
    total += product.price;
  }
  return { orderId: order.id, total };
}

async function orderStatus(orderId: string) {
  const { rows } = await getPool().query("select status from gestion_orders where id = $1", [orderId]);
  return rows[0].status as string;
}

async function paymentRows(orderId: string) {
  const { rows } = await getPool().query(
    "select method, amount, received_amount, change_amount from gestion_order_payments where order_id = $1 order by method",
    [orderId]
  );
  return rows.map((r) => ({
    method: r.method as string,
    amount: Number(r.amount),
    received: r.received_amount === null ? null : Number(r.received_amount),
    change: r.change_amount === null ? null : Number(r.change_amount),
  }));
}

beforeAll(async () => {
  dbPath = await seedFreshDb("payments");
});

afterAll(() => {
  tearDownTestDb(dbPath);
});

describe("pagos: estructura y cálculo (lib/admin/payments)", () => {
  it("toCents evita errores de punto flotante", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(8000.1)).toBe(800010);
  });

  it("el vuelto es recibido menos importe, nunca negativo, y 0 si no se cargó recibido", () => {
    expect(changeCents(1550000, 2000000)).toBe(450000);
    expect(changeCents(1550000, 1000000)).toBe(0);
    expect(changeCents(1550000, null)).toBe(0);
  });

  it("normaliza efectivo con recibido calculando el vuelto", () => {
    const [p] = normalizePayments([{ method: "efectivo", amount: 15500, received: 20000 }]);
    expect(p).toEqual({ method: "efectivo", amount: 15500, receivedAmount: 20000, changeAmount: 4500 });
  });
});

describe("pagos: finalizeOrder", () => {
  it("pago único en efectivo", async () => {
    const { orderId, total } = await orderWith(PAPAS_CHEDAR);
    await finalizeOrder(orderId, [{ method: "efectivo", amount: total }], null);
    expect(await orderStatus(orderId)).toBe("cerrada");
    expect(await paymentRows(orderId)).toEqual([
      { method: "efectivo", amount: 8000, received: null, change: null },
    ]);
  });

  it("pago único por transferencia", async () => {
    const { orderId, total } = await orderWith(PAPAS_CHEDAR);
    await finalizeOrder(orderId, [{ method: "transferencia", amount: total }], null);
    expect((await paymentRows(orderId))[0].method).toBe("transferencia");
  });

  it("pago combinado: $10.000 efectivo + $6.500 transferencia sobre $16.500", async () => {
    const { orderId, total } = await orderWith(PAPAS_CHEDAR, BURGER_AMERICAN);
    expect(total).toBe(16500);
    await finalizeOrder(
      orderId,
      [
        { method: "efectivo", amount: 10000 },
        { method: "transferencia", amount: 6500 },
      ],
      null
    );
    expect(await orderStatus(orderId)).toBe("cerrada");
    expect(await paymentRows(orderId)).toEqual([
      { method: "efectivo", amount: 10000, received: null, change: null },
      { method: "transferencia", amount: 6500, received: null, change: null },
    ]);
  });

  it("suma incorrecta: rechaza y el pedido sigue abierto", async () => {
    const { orderId } = await orderWith(PAPAS_CHEDAR, BURGER_AMERICAN);
    await expect(
      finalizeOrder(
        orderId,
        [
          { method: "efectivo", amount: 10000 },
          { method: "transferencia", amount: 6000 },
        ],
        null
      )
    ).rejects.toThrow("suman");
    expect(await orderStatus(orderId)).toBe("abierta");
    expect(await paymentRows(orderId)).toEqual([]);
  });

  it("pago de más (aunque sea con efectivo) también se rechaza: el importe aplicado no puede superar el total", async () => {
    const { orderId, total } = await orderWith(PAPAS_CHEDAR);
    await expect(finalizeOrder(orderId, [{ method: "efectivo", amount: total + 1 }], null)).rejects.toThrow(
      "suman"
    );
  });

  it("pago negativo: rechaza aunque la suma coincida con el total", async () => {
    const { orderId, total } = await orderWith(PAPAS_CHEDAR);
    await expect(
      finalizeOrder(
        orderId,
        [
          { method: "efectivo", amount: -5000 },
          { method: "transferencia", amount: total + 5000 },
        ],
        null
      )
    ).rejects.toThrow("mayores a cero");
    expect(await orderStatus(orderId)).toBe("abierta");
  });

  it("pago en cero: rechaza", async () => {
    const { orderId, total } = await orderWith(PAPAS_CHEDAR);
    await expect(
      finalizeOrder(
        orderId,
        [
          { method: "efectivo", amount: 0 },
          { method: "transferencia", amount: total },
        ],
        null
      )
    ).rejects.toThrow("mayores a cero");
  });

  it("importes no finitos o que no son número: rechaza", async () => {
    const { orderId, total } = await orderWith(PAPAS_CHEDAR);
    for (const bad of [Infinity, NaN, "8000", null, undefined, 8000.123]) {
      await expect(
        finalizeOrder(orderId, [{ method: "efectivo", amount: bad as unknown as number }], null)
      ).rejects.toThrow("importe");
    }
    expect(await orderStatus(orderId)).toBe("abierta");
    expect(total).toBe(8000);
  });

  it("método de pago inválido: rechaza", async () => {
    const { orderId, total } = await orderWith(PAPAS_CHEDAR);
    await expect(
      finalizeOrder(orderId, [{ method: "bitcoin" as unknown as "efectivo", amount: total }], null)
    ).rejects.toThrow("Medio de pago inválido");
  });

  it("sin ningún pago: rechaza", async () => {
    const { orderId } = await orderWith(PAPAS_CHEDAR);
    await expect(finalizeOrder(orderId, [], null)).rejects.toThrow("al menos un medio de pago");
  });

  it("cuenta corriente sin cliente: rechaza", async () => {
    const { orderId, total } = await orderWith(PAPAS_CHEDAR);
    await expect(finalizeOrder(orderId, [{ method: "cuenta_corriente", amount: total }], null)).rejects.toThrow(
      "Elegí un cliente"
    );
    expect(await orderStatus(orderId)).toBe("abierta");
  });

  it("cuenta corriente con un cliente que no existe: rechaza y no deja nada a medias", async () => {
    const { orderId, total } = await orderWith(PAPAS_CHEDAR);
    await expect(
      finalizeOrder(orderId, [{ method: "cuenta_corriente", amount: total }], 99999999)
    ).rejects.toThrow("no existe");
    expect(await orderStatus(orderId)).toBe("abierta");
    expect(await paymentRows(orderId)).toEqual([]);
  });

  it("cuenta corriente con cliente válido: debita solo esa parte, combinada con efectivo", async () => {
    const pool = getPool();
    const { rows } = await pool.query("select id, balance from gestion_customers order by id limit 1");
    const customerId = rows[0].id as number;
    const before = Number(rows[0].balance);

    const { orderId } = await orderWith(PAPAS_CHEDAR, BURGER_AMERICAN);
    await finalizeOrder(
      orderId,
      [
        { method: "efectivo", amount: 10000, received: 10000 },
        { method: "cuenta_corriente", amount: 6500 },
      ],
      customerId
    );

    const after = Number((await pool.query("select balance from gestion_customers where id = $1", [customerId])).rows[0].balance);
    expect(after).toBeCloseTo(before - 6500, 2);
  });

  it("efectivo con recibido: guarda recibido y vuelto, y la venta queda por el importe real", async () => {
    const { orderId, total } = await orderWith(PAPAS_CHEDAR, PAPAS_FRITAS);
    expect(total).toBe(15500);
    const result = await finalizeOrder(orderId, [{ method: "efectivo", amount: 15500, received: 20000 }], null);

    expect(result.total).toBe(15500);
    expect(await paymentRows(orderId)).toEqual([
      { method: "efectivo", amount: 15500, received: 20000, change: 4500 },
    ]);
    const { rows } = await getPool().query("select total from gestion_orders where id = $1", [orderId]);
    expect(Number(rows[0].total)).toBe(15500);
  });

  it("recibido menor que el importe: rechaza", async () => {
    const { orderId, total } = await orderWith(PAPAS_CHEDAR);
    await expect(
      finalizeOrder(orderId, [{ method: "efectivo", amount: total, received: total - 1 }], null)
    ).rejects.toThrow("no puede ser menor");
  });

  it("recibido en transferencia o cuenta corriente: rechaza (solo efectivo)", async () => {
    const { orderId, total } = await orderWith(PAPAS_CHEDAR);
    await expect(
      finalizeOrder(orderId, [{ method: "transferencia", amount: total, received: total + 100 } as OrderPayment], null)
    ).rejects.toThrow("Solo el efectivo");
  });

  it("cierre duplicado: el segundo cobro se rechaza y no se duplican los pagos", async () => {
    const { orderId, total } = await orderWith(PAPAS_CHEDAR);
    await finalizeOrder(orderId, [{ method: "efectivo", amount: total, received: total + 2000 }], null);
    await expect(
      finalizeOrder(orderId, [{ method: "efectivo", amount: total, received: total + 2000 }], null)
    ).rejects.toThrow("ya fue cerrado");
    expect(await paymentRows(orderId)).toHaveLength(1);
  });

  it("cobros simultáneos del mismo pedido: solo uno se aplica", async () => {
    const { orderId, total } = await orderWith(PAPAS_CHEDAR);
    const results = await Promise.allSettled([
      finalizeOrder(orderId, [{ method: "efectivo", amount: total }], null),
      finalizeOrder(orderId, [{ method: "efectivo", amount: total }], null),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await paymentRows(orderId)).toHaveLength(1);
  });
});

describe("pagos: la caja cuenta el importe aplicado, no lo recibido", () => {
  it("venta de $15.500 con $20.000 recibidos suma $15.500 al efectivo de caja (el vuelto no es venta)", async () => {
    await openShift(1000);
    const before = (await getCurrentShift())!;

    const { orderId } = await orderWith(PAPAS_CHEDAR, PAPAS_FRITAS);
    await finalizeOrder(orderId, [{ method: "efectivo", amount: 15500, received: 20000 }], null);

    const after = (await getCurrentShift())!;
    expect(after.salesEfectivo - before.salesEfectivo).toBe(15500);
    expect(after.expectedCash! - before.expectedCash!).toBe(15500);
  });

  it("venta combinada: cada medio suma lo suyo y el efectivo esperado solo crece por el efectivo aplicado", async () => {
    const before = (await getCurrentShift())!;

    const { orderId } = await orderWith(PAPAS_CHEDAR, BURGER_AMERICAN);
    await finalizeOrder(
      orderId,
      [
        { method: "efectivo", amount: 10000, received: 20000 },
        { method: "transferencia", amount: 6500 },
      ],
      null
    );

    const after = (await getCurrentShift())!;
    expect(after.salesEfectivo - before.salesEfectivo).toBe(10000);
    expect(after.salesTransferencia - before.salesTransferencia).toBe(6500);
    expect(after.expectedCash! - before.expectedCash!).toBe(10000);
  });
});

describe("pagos: el ticket muestra recibido y vuelto", () => {
  const config58: PrintConfig = {
    paperWidthMm: 58,
    headerText: "",
    footerText: "",
    paperSavingMode: false,
    fontSizeHeader: "normal",
    fontSizeBody: "normal",
    fontSizeFooter: "normal",
    directPrintEnabled: true,
    printerName: "POS-58-Series",
  };

  it("getPrintableTicket trae recibido y vuelto, y los dos formatos los imprimen", async () => {
    const { orderId } = await orderWith(PAPAS_CHEDAR, PAPAS_FRITAS);
    await finalizeOrder(orderId, [{ method: "efectivo", amount: 15500, received: 20000 }], null);

    const ticket = await getPrintableTicket(orderId);
    expect(ticket.total).toBe(15500);
    expect(ticket.payments).toEqual([
      { method: "efectivo", amount: 15500, receivedAmount: 20000, changeAmount: 4500 },
    ]);

    const html = renderTicketHtml(ticket, config58);
    expect(html).toContain("Recibido");
    expect(html).toContain("Vuelto");

    const escpos = renderTicketEscPos(ticket, config58).toString("latin1");
    expect(escpos).toContain("Recibido");
    expect(escpos).toContain("Vuelto");
    expect(escpos).toContain("$4.500");
    const lines = escpos.replace(/\x1b@/g, "").replace(/\x1b[aEd][\x00-\x09]/g, "").replace(/\x1d[!V][\x00-\xff]/g, "").split("\n");
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(32);
  });

  it("sin efectivo recibido el ticket no muestra Recibido ni Vuelto", async () => {
    const { orderId, total } = await orderWith(PAPAS_CHEDAR);
    await finalizeOrder(orderId, [{ method: "transferencia", amount: total }], null);
    const ticket = await getPrintableTicket(orderId);
    expect(renderTicketHtml(ticket, config58)).not.toContain("Vuelto");
    expect(renderTicketEscPos(ticket, config58).toString("latin1")).not.toContain("Vuelto");
  });
});
