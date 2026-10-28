import { NextRequest, NextResponse } from "next/server";
import { getState } from "@/lib/admin/store";
import { isDbConfigured } from "@/lib/admin/db";
import { requireUser } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ notConfigured: true });
  }
  if (!(await requireUser(request))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    return NextResponse.json(await getState());
  } catch (error) {
    // La base en la nube llegó al tope de su plan: se explica en pantalla en vez de un error técnico.
    if (error instanceof Error && /planLimitReached|account has restrictions/i.test(error.message)) {
      return NextResponse.json(
        {
          error:
            "La base de datos en la nube llegó al límite de su plan (hay que subir de plan en la cuenta de Prisma/Vercel o esperar al próximo mes). Mientras tanto se puede trabajar abriendo «MaderoSys - Iniciar SIN INTERNET»",
          dbLimit: true,
        },
        { status: 503 }
      );
    }
    throw error;
  }
}
