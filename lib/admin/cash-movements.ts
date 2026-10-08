import { getPool } from "@/lib/admin/db";

export type CashMovementType = "retiro" | "ingreso" | "ajuste";
export type CashMovementPaymentMethod = "efectivo" | "transferencia";

export interface CashMovement {
  id: string;
  shiftId: string;
  type: CashMovementType;
  amount: number;
  paymentMethod: CashMovementPaymentMethod;
  note: string | null;
  userName: string | null;
  createdAt: string;
}

function money(value: string | number) {
  return typeof value === "string" ? parseFloat(value) : value;
}

function mapRow(row: any): CashMovement {
  return {
    id: row.id,
    shiftId: row.shift_id,
    type: row.type,
    amount: money(row.amount),
    paymentMethod: row.payment_method,
    note: row.note,
    userName: row.user_name,
    createdAt: row.created_at,
  };
}

export async function createCashMovement(params: {
  shiftId: string;
  type: CashMovementType;
  amount: number;
  paymentMethod: CashMovementPaymentMethod;
  note: string | null;
  userId: number;
}): Promise<CashMovement> {
  if (!Number.isFinite(params.amount) || params.amount === 0) {
    throw new Error("El monto no puede ser cero");
  }
  // Retiro/ingreso son siempre positivos (su dirección ya la da el tipo);
  // ajuste admite signo porque puede corregir tanto un sobrante como un
  // faltante detectado a mano.
  if (params.type !== "ajuste" && params.amount < 0) {
    throw new Error("El monto tiene que ser mayor a cero");
  }
  const pool = getPool();
  const { rows } = await pool.query(
    `insert into gestion_cash_movements (shift_id, type, amount, payment_method, note, user_id)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [params.shiftId, params.type, params.amount, params.paymentMethod, params.note, params.userId]
  );
  return mapRow({ ...rows[0], user_name: null });
}

export async function listCashMovements(shiftId: string): Promise<CashMovement[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `select cm.*, u.name as user_name
     from gestion_cash_movements cm
     left join gestion_users u on u.id = cm.user_id
     where cm.shift_id = $1
     order by cm.created_at asc`,
    [shiftId]
  );
  return rows.map(mapRow);
}

// Suma de retiros/ingresos/ajustes en efectivo para un turno, agrupados por
// tipo — es lo que entra en la fórmula de efectivo esperado. Un retiro o
// ingreso en transferencia no afecta el efectivo físico de la caja.
export async function sumCashMovements(
  shiftId: string
): Promise<Record<CashMovementType, number>> {
  const pool = getPool();
  const { rows } = await pool.query<{ type: CashMovementType; total: string | number }>(
    `select type, sum(amount) as total
     from gestion_cash_movements
     where shift_id = $1 and payment_method = 'efectivo'
     group by type`,
    [shiftId]
  );
  const totals: Record<CashMovementType, number> = { retiro: 0, ingreso: 0, ajuste: 0 };
  for (const r of rows) {
    if (r.type in totals) totals[r.type] = money(r.total);
  }
  return totals;
}
