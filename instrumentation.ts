// Next.js llama a register() una vez al arrancar el servidor. Acá se prenden las tareas de fondo
// de la PC del local (copias de seguridad y conexión con la nube); ver lib/admin/background.ts.
// El import va DENTRO del "if (... === 'nodejs')": así Next no intenta compilarlo para el
// runtime Edge (que no tiene fs ni pg).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
