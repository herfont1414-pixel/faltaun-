import os from "node:os";
import QRCode from "qrcode";

// Direcciones con las que los celulares del local (en el mismo Wi-Fi) abren el sistema de la
// PC: http://IP-DE-LA-PC:3000/admin. Primero las de redes de casa/local (192.168…, 10…, 172.16-31…).
function isPrivate(ip: string) {
  return /^192\.168\./.test(ip) || /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

export function lanAddresses(port = Number(process.env.PORT) || 3000): string[] {
  const out: { url: string; rank: number }[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== "IPv4" || a.internal || a.address.startsWith("169.254.")) continue;
      // Adaptadores virtuales (VirtualBox, VMware, WSL, Hyper-V) no sirven para los celulares.
      const virtual = /virtual|vmware|vbox|hyper-v|wsl|vethernet|docker/i.test(name);
      out.push({ url: `http://${a.address}:${port}/admin`, rank: (isPrivate(a.address) ? 0 : 2) + (virtual ? 1 : 0) });
    }
  }
  return out.sort((x, y) => x.rank - y.rank).map((x) => x.url);
}

// Link fijo a la caja en la nube (https://…/caja): sigue andando aunque el router le cambie la
// dirección a la PC (ver lib/admin/caja-link.ts). Solo si la PC está conectada con la nube.
export function fixedCajaUrl(): string | null {
  const base = process.env.CLOUD_SYNC_URL?.trim().replace(/\/+$/, "");
  if (!base || !process.env.SYNC_TOKEN?.trim() || !/^https:\/\//i.test(base)) return null;
  return `${base}/caja?guardar`;
}

export async function lanInfo() {
  const addresses = process.env.VERCEL ? [] : lanAddresses();
  const fixedUrl = addresses.length ? fixedCajaUrl() : null;
  // El QR lleva al link fijo cuando existe: se escanea una sola vez y queda guardado para siempre.
  const target = fixedUrl ?? addresses[0];
  const qr = target
    ? await QRCode.toString(target, { type: "svg", margin: 1, color: { dark: "#111111ff", light: "#ffffffff" } })
    : null;
  return { addresses, fixedUrl, qr };
}
