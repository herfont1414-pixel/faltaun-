import { getPool } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { sumExpenses } from "@/lib/admin/expenses";
import type { PaymentMethod, Shift } from "@/lib/admin/types";

function money(value: string | number) {
  return typeof value === "string" ? parseFloat(value) : value;
}

function mapShiftRow(row: any): Shift {
  return {
    id: row.id,
    status: row.status,
    openingCash: money(row.opening_cash),
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    countedCash: row.counted_cash === null || row.counted_cash === undefined ? null : money(row.counted_cash),
    expectedCash: row.expected_cash === null || row.expected_cash === undefined ? null : money(row.expected_cash),
    difference: row.difference === null || row.difference === undefined ? null : money(row.difference),
    salesEfectivo: money(row.sales_efectivo),
    salesTransferencia: money(row.sales_transferencia),
    salesCuentaCorriente: money(row.sales_cuenta_corriente),
    expensesEfectivo: money(row.expenses_efectivo),
    notes: row.notes,
  };
}

// Suma desde gestion_order_payments (no desde gestion_orders.payment_method):
// una venta puede estar pagada con varios medios combinados, y ahí el
// desglose real vive en esta tabla, no en la columna de la orden.
async function sumSalesByMethod(fromISO: string, toISO: string) {
  const pool = getPool();
  const { rows } = await pool.query<{ method: PaymentMethod; total: string | number }>(
    `select gop.method, sum(gop.amount) as total
     from gestion_order_payments gop
     join gestion_orders o on o.id = gop.order_id
     where o.status = 'cerrada' and o.closed_at >= $1 and o.closed_at <= $2
     group by gop.method`,
    [fromISO, toISO]
  );
  const totals = { efectivo: 0, transferencia: 0, cuenta_corriente: 0 };
  for (const r of rows) {
    if (r.method in totals) {
      totals[r.method] = money(r.total);
    }
  }
  return totals;
}

export async function getCurrentShift(): Promise<Shift | null> {
  await ensureSeeded();
  const pool = getPool();
  const { rows } = await pool.query(
    "select * from gestion_shifts where status = 'abierto' order by opened_at desc limit 1"
  );
  if (!rows[0]) return null;
  const shift = rows[0];
  const nowISO = new Date().toISOString();
  const sales = await sumSalesByMethod(shift.opened_at, nowISO);
  const expensesEfectivo = await sumExpenses(shift.opened_at, nowISO, "efectivo");
  return {
    id: shift.id,
    status: "abierto",
    openingCash: money(shift.opening_cash),
    openedAt: shift.opened_at,
    closedAt: null,
    countedCash: null,
    expectedCash: money(shift.opening_cash) + sales.efectivo - expensesEfectivo,
    difference: null,
    salesEfectivo: sales.efectivo,
    salesTransferencia: sales.transferencia,
    salesCuentaCorriente: sales.cuenta_corriente,
    expensesEfectivo,
    notes: shift.notes,
  };
}

export async function listRecentShifts(limit = 10): Promise<Shift[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    "select * from gestion_shifts where status = 'cerrado' order by closed_at desc limit $1",
    [limit]
  );
  return rows.map(mapShiftRow);
}

export async function openShift(openingCash: number): Promise<Shift> {
  await ensureSeeded();
  const pool = getPool();
  const { rows: existing } = await pool.query("select id from gestion_shifts where status = 'abierto'");
  if (existing[0]) throw new Error("Ya hay un turno de caja abierto");

  const { rows } = await pool.query(
    "insert into gestion_shifts (opening_cash) values ($1) returning id",
    [openingCash]
  );
  const shift = await getCurrentShift();
  if (!shift) throw new Error(`No se pudo abrir el turno ${rows[0].id}`);
  return shift;
}

export async function closeShift(countedCash: number, notes: string | null): Promise<Shift> {
  const pool = getPool();
  const client = await pool.connect();
  let shiftId: string | null = null;
  try {
    await client.query("begin");

    const { rows } = await client.query("select * from gestion_shifts where status = 'abierto' for update");
    if (!rows[0]) throw new Error("No hay un turno de caja abierto");
    const shift = rows[0];
    shiftId = shift.id;

    const nowISO = new Date().toISOString();
    const { rows: salesRows } = await client.query<{ method: PaymentMethod; total: string | number }>(
      `select gop.method, sum(gop.amount) as total
       from gestion_order_payments gop
       join gestion_orders o on o.id = gop.order_id
       where o.status = 'cerrada' and o.closed_at >= $1 and o.closed_at <= $2
       group by gop.method`,
      [shift.opened_at, nowISO]
    );
    const sales = { efectivo: 0, transferencia: 0, cuenta_corriente: 0 };
    for (const r of salesRows) {
      if (r.method in sales) {
        sales[r.method] = money(r.total);
      }
    }

    const { rows: expenseRows } = await client.query<{ total: string | number }>(
      `select coalesce(sum(amount), 0) as total from gestion_expenses
       where created_at >= $1 and created_at <= $2 and payment_method = 'efectivo'`,
      [shift.opened_at, nowISO]
    );
    const expensesEfectivo = money(expenseRows[0].total);

    const expectedCash = money(shift.opening_cash) + sales.efectivo - expensesEfectivo;
    const difference = countedCash - expectedCash;

    await client.query(
      `update gestion_shifts
       set status = 'cerrado', closed_at = $2, counted_cash = $3, expected_cash = $4, difference = $5,
           sales_efectivo = $6, sales_transferencia = $7, sales_cuenta_corriente = $8, notes = $9,
           expenses_efectivo = $10
       where id = $1`,
      [
        shift.id,
        nowISO,
        countedCash,
        expectedCash,
        difference,
        sales.efectivo,
        sales.transferencia,
        sales.cuenta_corriente,
        notes,
        expensesEfectivo,
      ]
    );

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  const pool2 = getPool();
  const { rows: closedRows } = await pool2.query("select * from gestion_shifts where id = $1", [shiftId]);
  return mapShiftRow(closedRows[0]);
}
