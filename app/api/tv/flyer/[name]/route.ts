import { readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { resolveTvFlyer } from "@/lib/tv";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// Un flyer de la carpeta de la tele (solo imágenes de esa carpeta, sin rutas).
export async function GET(_request: Request, { params }: { params: { name: string } }) {
  const file = resolveTvFlyer(decodeURIComponent(params.name));
  if (!file) return NextResponse.json({ error: "No existe" }, { status: 404 });
  return new NextResponse(readFileSync(file), {
    headers: { "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "public, max-age=3600" },
  });
}
