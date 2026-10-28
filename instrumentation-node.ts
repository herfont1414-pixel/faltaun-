import { startBackgroundJobs } from "@/lib/admin/background";

// No se arrancan durante "next build" (solo cuando el servidor está andando).
if (process.env.NEXT_PHASE !== "phase-production-build") {
  startBackgroundJobs();
}
