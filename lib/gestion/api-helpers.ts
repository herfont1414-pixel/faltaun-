import { NextResponse } from "next/server";
import { getState } from "@/lib/gestion/store";

export function ok<T>(mutate: () => T) {
  try {
    const result = mutate();
    return NextResponse.json({ ...getState(), result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
