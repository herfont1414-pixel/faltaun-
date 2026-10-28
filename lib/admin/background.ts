// Tareas que corren solas dentro del servidor de la PC (se arrancan una vez, ver instrumentation.ts):
// copias de seguridad de la base local y la conexión con la nube.
import { getDbMode, getPool } from "@/lib/admin/db";
import { ensureSeeded } from "@/lib/admin/seed";
import { isCloudRole } from "@/lib/admin/role";
import { startBackupLoop } from "@/lib/admin/backup";
import { startSyncLoop } from "@/lib/admin/sync-worker";

export function startBackgroundJobs() {
  if (isCloudRole() || process.env.VERCEL) return; // la nube no hace copias ni se sincroniza consigo misma
  const ready = async () => {
    await ensureSeeded();
    return getPool();
  };
  if (getDbMode() === "sqlite") startBackupLoop(ready);
  startSyncLoop(ready);
}
