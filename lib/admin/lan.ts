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

export async function lanInfo() {
  const addresses = process.env.VERCEL ? [] : lanAddresses();
  const qr = addresses[0]
    ? await QRCode.toString(addresses[0], { type: "svg", margin: 1, color: { dark: "#111111ff", light: "#ffffffff" } })
    : null;
  return { addresses, qr };
}
