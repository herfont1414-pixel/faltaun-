import { NextRequest, NextResponse } from "next/server";
import { recordAudit, requireUser } from "@/lib/admin/auth";
import { deleteTvFlyer, listTvFlyers, MAX_FLYER_BYTES, saveTvFlyer, tvDir } from "@/lib/tv";

export const dynamic = "force-dynamic";

// Flyers de Madero TV desde el panel (admin y encargado): ver, subir y borrar. Se guardan en la
// carpeta MaderoSys-TV de la PC del local.
const ROLES = ["admin", "encargado"] as const;
const onPc = () => !process.env.VERCEL;

export async function GET(request: NextRequest) {
  if (!(await requireUser(request, [...ROLES]))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json({ flyers: onPc() ? listTvFlyers() : [], dir: onPc() ? tvDir() : null });
}

export async function POST(request: NextRequest) {
  const user = await requireUser(request, [...ROLES]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!onPc()) return NextResponse.json({ error: "Los flyers de la tele se cargan desde la PC del local." }, { status: 400 });
  const form = await request.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (!files.length) return NextResponse.json({ error: "Elegí una o más imágenes." }, { status: 400 });
  const saved: string[] = [];
  const errors: string[] = [];
  for (const file of files.slice(0, 20)) {
    if (file.size > MAX_FLYER_BYTES) {
      errors.push(`${file.name}: es muy pesada (máximo 15 MB).`);
      continue;
    }
    try {
      saved.push(saveTvFlyer(file.name, new Uint8Array(await file.arrayBuffer())).name);
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error ? error.message : "no se pudo guardar"}`);
    }
  }
  if (saved.length) await recordAudit({ userId: user.id, action: "tv_flyer_upload", entity: "tv", newValue: saved });
  return NextResponse.json({ saved, errors, flyers: listTvFlyers() }, { status: saved.length ? 200 : 400 });
}

export async function DELETE(request: NextRequest) {
  const user = await requireUser(request, [...ROLES]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const name = request.nextUrl.searchParams.get("name") ?? "";
  if (!onPc() || !deleteTvFlyer(name)) return NextResponse.json({ error: "Ese flyer no existe." }, { status: 404 });
  await recordAudit({ userId: user.id, action: "tv_flyer_delete", entity: "tv", oldValue: name });
  return NextResponse.json({ flyers: listTvFlyers() });
}
