import { NextResponse } from "next/server";
import { getState } from "@/lib/gestion/store";

export async function GET() {
  return NextResponse.json(getState());
}
