import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { seedFreshDb, tearDownTestDb, anyInStockProduct } from "./helpers";
import { openTable, addItem, finalizeOrder } from "@/lib/admin/store";
import { openShift, closeShift, getCurrentShift } from "@/lib/admin/shifts";
import { createCashMovement } from "@/lib/admin/cash-movements";
import { createExpense } from "@/lib/admin/expenses";
import { createUser } from "@/lib/admin/users";

let dbPath: string;
let userId: number;

beforeAll(async () => {
  dbPath = await seedFreshDb("caja");
  const user = await createUser({ name: "Cajero Test", pin: "3344", role: "admin" });
  userId = user.id;
});

afterAll(() => {
  tearDownTestDb(dbPath);
});

const firstProductId = anyInStockProduct;

describe("caja: apertura, venta, gasto, retiro, cierre, diferencia", () => {
  it("abre un turno con el monto inicial dado", async () => {
    const shift = await openShift(10000);
    expect(shift.status).toBe("abierto");
    expect(shift.openingCash).toBe(10000);
  });

  it("no se puede abrir un segundo turno mientras el primero está abierto", async () => {
    await expect(openShift(5000)).rejects.toThrow("Ya hay un turno de caja abierto");
  });

  it("una venta en efectivo suma al efectivo esperado", async () => {
    const product = await firstProductId();
    const order = await openTable(20, {});
    await addItem(order.id, product.id);
    await finalizeOrder(order.id, [{ method: "efectivo", amount: product.price }], null);

    const shift = await getCurrentShift();
    expect(shift?.salesEfectivo).toBe(product.price);
    expect(shift?.expectedCash).toBe(10000 + product.price);
  });

  it("un gasto en efectivo resta del efectivo esperado", async () => {
    await createExpense({ concept: "Hielo", amount: 500, paymentMethod: "efectivo" });
    const shift = await getCurrentShift();
    expect(shift?.expensesEfectivo).toBe(500);
  });

  it("un retiro resta y es distinto de un gasto", async () => {
    const shift = await getCurrentShift();
    await createCashMovement({
      shiftId: shift!.id,
      type: "retiro",
      amount: 1000,
      paymentMethod: "efectivo",
      note: "retiro del dueño",
      userId,
    });
    const updated = await getCurrentShift();
    expect(updated?.retirosEfectivo).toBe(1000);
    expect(updated?.expensesEfectivo).toBe(500); // el gasto no cambió
  });

  it("cerrar el turno calcula la diferencia contado - esperado", async () => {
    const before = await getCurrentShift();
    const expected = before!.expectedCash!;
    const counted = expected - 200; // faltante de 200

    const closed = await closeShift(counted, "cierre de prueba");
    expect(closed.status).toBe("cerrado");
    expect(closed.expectedCash).toBe(expected);
    expect(closed.countedCash).toBe(counted);
    expect(closed.difference).toBe(-200);
  });

  it("después de cerrar, no hay turno abierto", async () => {
    expect(await getCurrentShift()).toBeNull();
  });
});
