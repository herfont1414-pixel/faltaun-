import { NextResponse } from "next/server";
import { getState } from "@/lib/gestion/store";
import { isDbConfigured } from "@/lib/gestion/db";

export async function ok<T>(mutate: () => Promise<T>) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "La base de datos todavía no está configurada (falta DATABASE_URL)." },
      { status: 503 }
    );
  }
  try {
    const result = await mutate();
    const state = await getState();
    return NextResponse.json({ ...state, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
