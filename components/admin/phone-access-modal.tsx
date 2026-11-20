"use client";

import { useEffect, useState } from "react";

// "Usar en el celular": la dirección de la PC en el Wi-Fi del local, con un QR para que los
// mozos abran el panel en su celular y tomen los pedidos en la mesa.
export function PhoneAccessModal({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<{ addresses: string[]; fixedUrl?: string | null; qr: string | null } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/lan-info", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setInfo)
      .catch(() => setError("No se pudo averiguar la dirección de la PC."));
  }, []);

  const onPc = typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div style={{ background: "#fff", borderRadius: 16, padding: 22, width: 420, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Usar en el celular</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 14 }}>
          Los mozos pueden tomar los pedidos en la mesa con su celular. Tiene que estar conectado al <b>mismo Wi-Fi</b> que esta PC, y la PC prendida con MaderoSys abierto.
        </div>
        {error && <p style={{ color: "#b3261e" }}>{error}</p>}
        {!info && !error && <p>Buscando la dirección…</p>}
        {info && info.addresses.length === 0 && (
          <p style={{ fontSize: 13 }}>
            {onPc ? "Esta PC no está conectada a ninguna red. Conectala al Wi-Fi o al router del local." : "Desde acá no se puede usar en el celular: solo desde la PC del local."}
          </p>
        )}
        {info && info.addresses.length > 0 && (
          <>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              {info.qr && <div style={{ width: 210, height: 210 }} dangerouslySetInnerHTML={{ __html: info.qr.replace("<svg", '<svg width="100%" height="100%"') }} />}
            </div>
            {info.fixedUrl ? (
              <>
                <div style={{ textAlign: "center", fontSize: 18, fontWeight: 800, marginBottom: 4, wordBreak: "break-all" }}>{info.fixedUrl.replace(/^https:\/\//, "").replace(/\?.*$/, "")}</div>
                <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-faint)", marginBottom: 8 }}>
                  Link fijo: lleva siempre a esta PC, aunque el router le cambie la dirección. Dirección de hoy: {info.addresses[0]}
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: "center", fontSize: 18, fontWeight: 800, marginBottom: 4, wordBreak: "break-all" }}>{info.addresses[0]}</div>
                {info.addresses.length > 1 && (
                  <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-faint)", marginBottom: 8 }}>
                    Si no abre, probá: {info.addresses.slice(1).join(" · ")}
                  </div>
                )}
              </>
            )}
            <ol style={{ fontSize: 13, paddingLeft: 18, margin: "10px 0", lineHeight: 1.6 }}>
              <li>En el celular, escaneá el código con la cámara (o escribí la dirección en Chrome).</li>
              <li>Entrá con el PIN de cada mozo.</li>
              <li>
                Para tenerlo a mano: en Chrome, ⋮ → <b>Agregar a la pantalla principal</b>.
                {info.fixedUrl && " Hacelo en la página que se abre al escanear: queda un acceso «Madero Caja» que funciona siempre."}
              </li>
            </ol>
            <div style={{ fontSize: 12, color: "var(--text-faint)", background: "#f7f5f2", borderRadius: 10, padding: "8px 10px" }}>
              Si el celular no abre la página: en esta PC hacé doble clic en <b>scripts\\permitir-celulares.bat</b> (una sola vez; Windows pide permiso) y probá de nuevo.
              {!info.fixedUrl && " La dirección puede cambiar si se reinicia la PC o el router: volvé a mirarla acá."}
            </div>
          </>
        )}
        <div className="footer-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
