"use client";

import { useEffect, useRef, useState } from "react";

interface Flyer {
  name: string;
  url: string;
}

// "Madero TV" en el panel: abrir la pantalla de la tele y manejar los flyers que pasan
// (subir y borrar), sin tener que buscar la carpeta en la PC. Funciona también desde el celular.
export function TvManagerModal({ onClose }: { onClose: () => void }) {
  const [flyers, setFlyers] = useState<Flyer[] | null>(null);
  const [dir, setDir] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    fetch("/api/admin/tv-flyers", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "No se pudo cargar");
        setFlyers(d.flyers ?? []);
        setDir(d.dir ?? null);
      })
      .catch((e) => {
        setFlyers([]);
        setMsg((e as Error).message);
      });
  }
  useEffect(load, []);

  async function upload(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    setMsg("");
    const form = new FormData();
    for (const f of Array.from(files)) form.append("files", f);
    try {
      const r = await fetch("/api/admin/tv-flyers", { method: "POST", body: form });
      const d = await r.json().catch(() => ({}));
      if (d.flyers) setFlyers(d.flyers);
      const parts = [];
      if (d.saved?.length) parts.push(`Se ${d.saved.length === 1 ? "agregó 1 flyer" : `agregaron ${d.saved.length} flyers`}: en menos de un minuto aparece${d.saved.length === 1 ? "" : "n"} en la tele.`);
      if (d.errors?.length) parts.push(d.errors.join(" "));
      if (!r.ok && !parts.length) parts.push(d.error ?? "No se pudo subir.");
      setMsg(parts.join(" "));
    } catch {
      setMsg("No se pudo subir. Probá de nuevo.");
    }
    setBusy(false);
  }

  async function remove(name: string) {
    if (!window.confirm(`¿Sacar «${name}» de la tele? Se borra de la carpeta.`)) return;
    const r = await fetch(`/api/admin/tv-flyers?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (d.flyers) setFlyers(d.flyers);
    else setMsg(d.error ?? "No se pudo borrar.");
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div style={{ background: "#fff", borderRadius: 16, padding: 22, width: 640, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Madero TV</div>
          <button type="button" className="btn btn-primary" style={{ flex: "none" }} onClick={() => window.open("/tv", "_blank")}>
            Abrir la pantalla de la tele
          </button>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 14 }}>
          Además de la carta, los destacados, la fidelidad y el QR, en la tele pasan estos flyers. Pasan en orden de nombre. Los horizontales se ven a pantalla completa.
        </div>

        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        <button type="button" className="btn" style={{ width: "100%", padding: "12px", fontWeight: 700, marginBottom: 10 }} disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "Subiendo…" : "＋ Subir flyers (JPG o PNG)"}
        </button>
        {msg && <div style={{ fontSize: 13, marginBottom: 10, color: "var(--text-dim)" }}>{msg}</div>}

        {flyers === null ? (
          <p>Cargando…</p>
        ) : flyers.length === 0 ? (
          <div className="m-table"><div className="m-empty">Todavía no hay flyers. Subí el primero con el botón de arriba.</div></div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {flyers.map((f) => (
              <div key={f.name} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "#111" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.name} style={{ width: "100%", height: 120, objectFit: "contain", display: "block" }} />
                <div style={{ background: "#fff", padding: "6px 8px", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11.5, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.name}>{f.name}</span>
                  <button type="button" onClick={() => remove(f.name)} style={{ color: "#b3261e", fontSize: 12, fontWeight: 700, background: "none", border: 0, cursor: "pointer" }}>
                    Sacar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {dir && <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 12 }}>Carpeta en la PC: {dir}</div>}

        <div className="footer-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
