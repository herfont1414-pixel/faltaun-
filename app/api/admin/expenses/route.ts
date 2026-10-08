import { NextRequest, NextResponse } from "next/server";
import { createExpense, listRecentExpenses } from "@/lib/admin/expenses";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";
import type { ExpensePaymentMethod } from "@/lib/admin/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ expenses: [] });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const expenses = await listRecentExpenses(30);
  return NextResponse.json({ expenses });
}

export async function POST(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });
  }
  if (!(await requireUser(request, ["admin", "encargado"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const body = await request.json();
  const concept = String(body.concept ?? "").trim();
  const amount = Number(body.amount);
  const paymentMethod: ExpensePaymentMethod = body.paymentMethod === "transferencia" ? "transferencia" : "efectivo";

  if (!concept || !amount || amount <= 0) {
    return NextResponse.json({ error: "Faltan el concepto o el monto del gasto" }, { status: 400 });
  }

  try {
    const expense = await createExpense({ concept, amount, paymentMethod });
    return NextResponse.json({ expense });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
