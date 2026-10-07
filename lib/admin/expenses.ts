import { getPool } from "@/lib/admin/db";
import type { Expense, ExpensePaymentMethod } from "@/lib/admin/types";

function money(value: string | number) {
  return typeof value === "string" ? parseFloat(value) : value;
}

function mapRow(row: any): Expense {
  return {
    id: row.id,
    concept: row.concept,
    amount: money(row.amount),
    paymentMethod: row.payment_method,
    createdAt: row.created_at,
  };
}

export async function createExpense(input: {
  concept: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
}): Promise<Expense> {
  const pool = getPool();
  const { rows } = await pool.query(
    `insert into gestion_expenses (concept, amount, payment_method) values ($1, $2, $3) returning *`,
    [input.concept, input.amount, input.paymentMethod]
  );
  return mapRow(rows[0]);
}

export async function listRecentExpenses(limit = 30): Promise<Expense[]> {
  const pool = getPool();
  const { rows } = await pool.query("select * from gestion_expenses order by created_at desc limit $1", [
    limit,
  ]);
  return rows.map(mapRow);
}

export async function sumExpenses(
  fromISO: string,
  toISO: string,
  paymentMethod?: ExpensePaymentMethod
): Promise<number> {
  const pool = getPool();
  const { rows } = paymentMethod
    ? await pool.query<{ total: string | number }>(
        `select coalesce(sum(amount), 0) as total from gestion_expenses
         where created_at >= $1 and created_at <= $2 and payment_method = $3`,
        [fromISO, toISO, paymentMethod]
      )
    : await pool.query<{ total: string | number }>(
        "select coalesce(sum(amount), 0) as total from gestion_expenses where created_at >= $1 and created_at <= $2",
        [fromISO, toISO]
      );
  return money(rows[0].total);
}
