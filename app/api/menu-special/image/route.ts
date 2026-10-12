import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/admin/db";
import { getMenuSpecialImageData } from "@/lib/admin/menu-special";

export const dynamic = "force-dynamic";

// Foto pública del especial del día. La URL lleva ?v=<versión>, así cada foto nueva es
// otra dirección y se puede guardar en caché por mucho tiempo.
export async function GET() {
  if (!isDbConfigured()) return new NextResponse(null, { status: 404 });
  const image = await getMenuSpecialImageData().catch(() => null);
  if (!image) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
