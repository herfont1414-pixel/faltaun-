"use client";

import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/admin/format";
import type { AdminProduct } from "@/lib/admin/types";

interface Special {
  active: boolean;
  productId: number | null;
  text: string;
}

const TEXT_MAX = 140;

interface ImageInfo {
  version: string;
  productId: number | null;
  sizeKb: number;
}

// Achica la foto en el navegador antes de subirla (lado mayor 1200 px, JPEG): una foto de
// celular de varios MB queda en unos 150-300 KB, sin perder calidad visible en el menú.
async function resizeImage(file: File, maxSide = 1200, quality = 0.82): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("No se pudo leer la imagen. Probá con una foto JPG o PNG."));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Este navegador no puede procesar la imagen");
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Tarjeta de Configuración para elegir el "Especial del día" que se muestra
// arriba del menú online: producto, texto breve y un interruptor.
export function MenuSpecialCard() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [saved, setSaved] = useState<Special | null>(null);
  const [active, setActive] = useState(false);
  const [productId, setProductId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [image, setImage] = useState<ImageInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imageMsg, setImageMsg] = useState("");
  const [imageError, setImageError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/products").then((r) => r.json()),
      fetch("/api/admin/menu-special").then((r) => r.json()),
    ])
      .then(([p, s]: [{ products?: AdminProduct[] }, { special?: Special; image?: ImageInfo | null }]) => {
        setProducts((p.products ?? []).filter((x) => x.active));
        setImage(s.image ?? null);
        if (s.special) {
          setSaved(s.special);
          setActive(s.special.active);
          setProductId(s.special.productId);
          setText(s.special.text);
        }
      })
      .catch(() => setError("No se pudo cargar el especial del día"));
  }, []);

  const product = products.find((p) => p.id === productId) ?? null;
  const dirty =
    !saved || saved.active !== active || saved.productId !== productId || saved.text !== text.trim();
  const categories = Array.from(new Set(products.map((p) => p.category)));

  async function uploadPhoto(file: File) {
    setImageMsg("");
    setImageError("");
    if (!file.type.startsWith("image/")) {
      setImageError("Elegí un archivo de imagen (JPG, PNG…)");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await resizeImage(file);
      const res = await fetch("/api/admin/menu-special/image", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, productId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo subir la foto");
      setImage(data.image);
      setImageMsg(`Foto guardada (${data.image.sizeKb} KB).`);
    } catch (e) {
      setImageError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto() {
    setImageMsg("");
    setImageError("");
    setUploading(true);
    const res = await fetch("/api/admin/menu-special/image", { method: "DELETE" });
    setUploading(false);
    if (!res.ok) {
      setImageError("No se pudo quitar la foto");
      return;
    }
    setImage(null);
    setImageMsg("Foto quitada.");
  }

  async function save() {
    setSaving(true);
    setMsg("");
    setError("");
    const res = await fetch("/api/admin/menu-special", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active, productId, text }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar");
      return;
    }
    setSaved(data.special);
    setText(data.special.text);
    setMsg(data.special.active ? "Guardado: el especial ya se ve en el menú online" : "Guardado: el especial está apagado");
  }

  return (
    <div className="m-section">
      <div className="m-section-title">Especial del día (menú online)</div>
      <div className="caja-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className={`btn ${active ? "btn-primary" : ""}`}
            style={{ flex: "none", padding: "8px 14px" }}
            onClick={() => setActive((v) => !v)}
          >
            {active ? "Activo" : "Apagado"}
          </button>
          <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
            {active ? "Se muestra arriba del menú online" : "No se muestra en el menú online"}
          </span>
        </div>

        <label style={{ fontSize: 12.5, fontWeight: 600 }}>
          Producto
          <select
            value={productId ?? ""}
            onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : null)}
            className="caja-input"
            style={{ marginTop: 6, width: "100%" }}
          >
            <option value="">Elegí un producto</option>
            {categories.map((cat) => (
              <optgroup key={cat} label={cat}>
                {products
                  .filter((p) => p.category === cat)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {money(p.price)}
                      {p.inStock ? "" : " (sin stock)"}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          {product && !product.inStock && (
            <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "#b45309" }}>
              Este producto está sin stock: mientras tanto el especial no se muestra en el menú.
            </span>
          )}
          <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--text-faint)" }}>
            El precio es siempre el vigente del producto; para cambiarlo, editalo en Productos.
          </span>
        </label>

        <label style={{ fontSize: 12.5, fontWeight: 600 }}>
          Texto breve (opcional)
          <input
            type="text"
            value={text}
            maxLength={TEXT_MAX}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ej: Con papas y bebida incluida, solo por hoy"
            className="caja-input"
            style={{ marginTop: 6, width: "100%" }}
          />
          <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--text-faint)" }}>
            {text.length}/{TEXT_MAX}
          </span>
        </label>

        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
          Foto (opcional)
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginTop: 6, flexWrap: "wrap" }}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/menu-special/image?v=${encodeURIComponent(image.version)}`}
                alt="Foto del especial"
                style={{ width: 120, maxHeight: 200, objectFit: "contain", borderRadius: 10, background: "#111" }}
              />
            ) : (
              <div
                style={{ width: 120, height: 120, borderRadius: 10, border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, color: "var(--text-faint)", textAlign: "center", padding: 8 }}
              >
                Sin foto
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 180 }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadPhoto(file);
                }}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: "none", padding: "8px 14px" }}
                  disabled={uploading || productId === null}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? "Subiendo…" : image ? "Cambiar foto" : "Subir foto"}
                </button>
                {image && (
                  <button type="button" className="btn" style={{ flex: "none", padding: "8px 14px" }} disabled={uploading} onClick={removePhoto}>
                    Quitar foto
                  </button>
                )}
              </div>
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>
                {productId === null
                  ? "Elegí primero el producto del especial."
                  : "Se achica sola antes de subirla. Se ve completa, sin recortar, arriba del menú."}
              </span>
              {image && productId !== null && image.productId !== productId && (
                <span style={{ fontSize: 11, fontWeight: 400, color: "#b45309" }}>
                  Esta foto se subió para otro producto: no se muestra con el especial actual. Subí una nueva o quitala.
                </span>
              )}
              {imageError && <span style={{ fontSize: 12, fontWeight: 400, color: "#b91c1c" }}>{imageError}</span>}
              {imageMsg && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-dim)" }}>{imageMsg}</span>}
            </div>
          </div>
        </div>

        {error && <div style={{ fontSize: 12.5, color: "#b91c1c" }}>{error}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: "none", padding: "10px 16px" }}
            disabled={saving || !dirty}
            onClick={save}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
          <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{msg}</span>
        </div>
      </div>
    </div>
  );
}
