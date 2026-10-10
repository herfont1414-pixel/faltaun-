"use client";

import { useCallback, useEffect, useState } from "react";
import type { LoyaltyAccount, LoyaltyGrant, LoyaltyReward, LoyaltySearchRow } from "@/lib/admin/loyalty";

type PendingGrant = LoyaltyGrant & { customerName: string | null };
interface BurgerChoice {
  id: number;
  name: string;
  stockQty: number | null;
  inStock: boolean;
}
interface ProductOption {
  id: number;
  name: string;
  active: boolean;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo completar la operación");
  return data as T;
}

function RedeemModal({
  grant,
  customer,
  burgerChoices,
  onClose,
  onDone,
}: {
  grant: LoyaltyGrant;
  customer: string;
  burgerChoices: BurgerChoice[];
  onClose: () => void;
  onDone: () => void;
}) {
  const isBurger = grant.rewardCode === "burger";
  const [productId, setProductId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (busy) return; // protege contra doble clic en la pantalla; el servidor también lo impide
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/loyalty/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId: grant.id, productId: productId ? Number(productId) : null, note: note.trim() || null }),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80 }}
      onClick={busy ? undefined : onClose}
    >
      <div style={{ background: "#fff", borderRadius: 16, padding: 22, width: 440, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Registrar entrega del premio</div>
        <div style={{ fontSize: 13.5, marginBottom: 12 }}>
          <strong>{grant.rewardName}</strong> · hito de {grant.milestone} sellos · {customer}
        </div>
        {grant.rewardDescription && (
          <div style={{ fontSize: 13, background: "#f6f4ef", borderRadius: 10, padding: "8px 10px", marginBottom: 12 }}>{grant.rewardDescription}</div>
        )}
        {isBurger && (
          <>
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>Hamburguesa entregada (opcional)</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              disabled={busy}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", margin: "4px 0 10px" }}
            >
              <option value="">No indicar</option>
              {burgerChoices.map((b) => (
                <option key={b.id} value={b.id} disabled={!b.inStock || (b.stockQty !== null && b.stockQty < 1)}>
                  {b.name}
                  {!b.inStock || (b.stockQty !== null && b.stockQty < 1) ? " (agotada)" : ""}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 10 }}>
              Tiene que ser una hamburguesa <strong>simple</strong> (no doble ni triple). Si el producto controla stock, se descuenta 1 unidad al confirmar.
            </div>
          </>
        )}
        <label style={{ fontSize: 12.5, fontWeight: 600 }}>Nota (opcional)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 200))}
          disabled={busy}
          placeholder="Ej.: detalle de la entrega"
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", margin: "4px 0 12px" }}
        />
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          ¿Ya entregaste el premio al cliente? Confirmar lo marca como canjeado y no se puede deshacer. Los sellos no cambian.
        </div>
        {error && <div style={{ color: "#b3261e", fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn" style={{ flex: "none" }} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" style={{ flex: "none" }} onClick={confirm} disabled={busy}>
            {busy ? "Registrando…" : "Sí, ya lo entregué"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RewardsConfig({ rewards, products, onSaved }: { rewards: LoyaltyReward[]; products: ProductOption[]; onSaved: () => void }) {
  const [drafts, setDrafts] = useState<Record<number, { name: string; description: string; productId: string; active: boolean }>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ id: number; text: string; error?: boolean } | null>(null);

  const draft = (r: LoyaltyReward) =>
    drafts[r.id] ?? { name: r.name, description: r.description ?? "", productId: r.productId ? String(r.productId) : "", active: r.active };
  const set = (r: LoyaltyReward, patch: Partial<ReturnType<typeof draft>>) => setDrafts((d) => ({ ...d, [r.id]: { ...draft(r), ...patch } }));

  async function save(r: LoyaltyReward) {
    const d = draft(r);
    setBusyId(r.id);
    setMessage(null);
    try {
      await api(`/api/admin/loyalty/rewards/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: d.name, description: d.description, productId: d.productId ? Number(d.productId) : null, active: d.active }),
      });
      setDrafts((all) => {
        const { [r.id]: _omit, ...rest } = all;
        return rest;
      });
      setMessage({ id: r.id, text: "Guardado" });
      onSaved();
    } catch (e) {
      setMessage({ id: r.id, text: (e as Error).message, error: true });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rewards.map((r) => {
        const d = draft(r);
        return (
          <div key={r.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, background: "#fff", opacity: d.active ? 1 : 0.7 }}>
            <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginBottom: 8 }}>
              Se gana a los <strong>{r.firstMilestone}</strong> sellos y se repite cada <strong>{r.step}</strong> (hitos {r.firstMilestone}, {r.firstMilestone + r.step},{" "}
              {r.firstMilestone + 2 * r.step}…). Los hitos no se editan desde acá.
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <input value={d.name} onChange={(e) => set(r, { name: e.target.value })} placeholder="Nombre del premio" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)" }} />
              <input value={d.description} onChange={(e) => set(r, { description: e.target.value })} placeholder="Descripción para el cliente" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)" }} />
              <label style={{ fontSize: 12.5 }}>
                Producto vinculado (por ID, sin precio):{" "}
                <select value={d.productId} onChange={(e) => set(r, { productId: e.target.value })} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)", maxWidth: 240 }}>
                  <option value="">Ninguno</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.active ? "" : " (pausado)"}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={d.active} onChange={(e) => set(r, { active: e.target.checked })} /> Premio activo (si se desactiva, deja de generarse en los próximos hitos)
              </label>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
              <button type="button" className="btn btn-primary" style={{ flex: "none" }} disabled={busyId === r.id || !drafts[r.id]} onClick={() => save(r)}>
                Guardar cambios
              </button>
              {message?.id === r.id && <span style={{ fontSize: 13, color: message.error ? "#b3261e" : "#1d5a31" }}>{message.text}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FidelidadPremiosView() {
  const [pending, setPending] = useState<PendingGrant[] | null>(null);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [burgerChoices, setBurgerChoices] = useState<BurgerChoice[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LoyaltySearchRow[] | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ account: LoyaltyAccount; grants: LoyaltyGrant[] } | null>(null);
  const [detailError, setDetailError] = useState("");
  const [redeeming, setRedeeming] = useState<{ grant: LoyaltyGrant; customer: string } | null>(null);
  const [doneMessage, setDoneMessage] = useState("");

  const loadOverview = useCallback(async () => {
    try {
      const data = await api<{ pending: PendingGrant[]; rewards: LoyaltyReward[]; burgerChoices: BurgerChoice[] }>("/api/admin/loyalty");
      setPending(data.pending);
      setRewards(data.rewards);
      setBurgerChoices(data.burgerChoices);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadDetail = useCallback(async (phone: string) => {
    setDetailError("");
    try {
      setDetail(await api(`/api/admin/loyalty?phone=${encodeURIComponent(phone)}`));
    } catch (e) {
      setDetail(null);
      setDetailError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    api<{ products: ProductOption[] }>("/api/admin/products")
      .then((d) => setProducts(d.products.map((p) => ({ id: p.id, name: p.name, active: p.active }))))
      .catch(() => {});
  }, [loadOverview]);

  useEffect(() => {
    if (selectedPhone) loadDetail(selectedPhone);
    else setDetail(null);
  }, [selectedPhone, loadDetail]);

  async function search() {
    setSelectedPhone(null);
    try {
      setResults((await api<{ results: LoyaltySearchRow[] }>(`/api/admin/loyalty?q=${encodeURIComponent(query)}`)).results);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function afterRedeem() {
    setRedeeming(null);
    setDoneMessage("Entrega registrada. El premio quedó marcado como canjeado.");
    await Promise.all([loadOverview(), selectedPhone ? loadDetail(selectedPhone) : Promise.resolve()]);
  }

  if (error && !pending) return <div className="mostrador"><h1>Fidelidad</h1><p>{error}</p></div>;
  if (!pending) return <div className="mostrador">Cargando…</div>;

  const available = detail?.grants.filter((g) => g.status === "disponible") ?? [];
  const history = detail?.grants.filter((g) => g.status === "canjeado") ?? [];

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 6 }}>Fidelidad · Premios y canjes</h1>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-faint)" }}>
        Registrá el canje solo cuando el premio se entregó. Canjear no descuenta sellos ni afecta otros premios. Los premios se generan al llegar a cada hito con
        pedidos nuevos; no se crean premios por sellos anteriores.
      </p>
      {doneMessage && (
        <div style={{ background: "#e8f6ec", border: "1px solid #7bc58f", color: "#1d5a31", borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontSize: 13 }}>{doneMessage}</div>
      )}

      <div className="m-section" style={{ marginBottom: 22 }}>
        <div className="m-section-title">Buscar cliente</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Teléfono o nombre…"
            className="caja-input"
            style={{ maxWidth: 320 }}
          />
          <button type="button" className="btn btn-primary" style={{ flex: "none" }} onClick={search} disabled={query.trim().length < 2}>
            Buscar
          </button>
        </div>
        {results && !selectedPhone && (
          <table className="m-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Teléfono</th>
                <th style={{ textAlign: "right" }}>Sellos</th>
                <th style={{ textAlign: "right" }}>Premios pendientes</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr><td colSpan={4} className="m-empty">Sin resultados.</td></tr>
              ) : (
                results.map((r) => (
                  <tr key={r.phone} className="m-row-strip" style={{ cursor: "pointer" }} onClick={() => { setDoneMessage(""); setSelectedPhone(r.phone); }}>
                    <td>{r.name || "Sin nombre"}</td>
                    <td>{r.phone}</td>
                    <td style={{ textAlign: "right" }}>{r.stamps}</td>
                    <td style={{ textAlign: "right" }}>{r.pendingGrants}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {selectedPhone && (
        <div className="m-section" style={{ marginBottom: 22 }}>
          <div className="m-section-title">
            Ficha del cliente{" "}
            <button type="button" className="btn" style={{ flex: "none", padding: "3px 10px", marginLeft: 8 }} onClick={() => setSelectedPhone(null)}>
              Cerrar
            </button>
          </div>
          {detailError && <p style={{ color: "#b3261e" }}>{detailError}</p>}
          {detail && (
            <>
              <div style={{ marginBottom: 12, fontSize: 14 }}>
                <strong>{detail.account.name || "Sin nombre"}</strong> · {detail.account.phone} · <strong>{detail.account.stamps}</strong> sellos · {detail.account.orderCount} pedidos ·
                faltan {detail.account.stampsToNextReward} sellos para el próximo premio
              </div>
              <h3 style={{ fontSize: 14, margin: "6px 0" }}>Premios disponibles para entregar ({available.length})</h3>
              {available.length === 0 ? (
                <div className="m-table"><div className="m-empty">No tiene premios pendientes.</div></div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {available.map((g) => (
                    <div key={g.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", background: "#fff", display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{g.rewardName}</div>
                        <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
                          Hito de {g.milestone} sellos · generado el {fmtDate(g.createdAt)}
                          {g.rewardDescription ? ` · ${g.rewardDescription}` : ""}
                        </div>
                      </div>
                      <button type="button" className="btn btn-primary" style={{ flex: "none" }} onClick={() => { setDoneMessage(""); setRedeeming({ grant: g, customer: detail.account.name || detail.account.phone }); }}>
                        Registrar entrega
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <h3 style={{ fontSize: 14, margin: "14px 0 6px" }}>Historial de canjes ({history.length})</h3>
              {history.length === 0 ? (
                <div className="m-table"><div className="m-empty">Todavía no canjeó premios.</div></div>
              ) : (
                <table className="m-table">
                  <thead>
                    <tr><th>Premio</th><th style={{ textAlign: "right" }}>Hito</th><th>Entregado</th><th>Por</th><th>Detalle</th></tr>
                  </thead>
                  <tbody>
                    {history.map((g) => (
                      <tr key={g.id}>
                        <td>{g.rewardName}</td>
                        <td style={{ textAlign: "right" }}>{g.milestone}</td>
                        <td>{fmtDate(g.redeemedAt)}</td>
                        <td>{g.redeemedByName ?? "—"}</td>
                        <td>{[g.deliveredProductName, g.note].filter(Boolean).join(" · ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}

      <div className="m-section" style={{ marginBottom: 22 }}>
        <div className="m-section-title">Premios pendientes de entrega ({pending.length})</div>
        {pending.length === 0 ? (
          <div className="m-table"><div className="m-empty">No hay premios pendientes.</div></div>
        ) : (
          <table className="m-table">
            <thead>
              <tr><th>Cliente</th><th>Teléfono</th><th>Premio</th><th style={{ textAlign: "right" }}>Hito</th><th>Generado</th><th></th></tr>
            </thead>
            <tbody>
              {pending.map((g) => (
                <tr key={g.id}>
                  <td>{g.customerName || "Sin nombre"}</td>
                  <td>{g.phone}</td>
                  <td>{g.rewardName}</td>
                  <td style={{ textAlign: "right" }}>{g.milestone}</td>
                  <td>{fmtDate(g.createdAt)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button type="button" className="btn" style={{ flex: "none", padding: "5px 10px" }} onClick={() => { setDoneMessage(""); setSelectedPhone(g.phone); }}>
                      Ver cliente
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="m-section">
        <div className="m-section-title">Configuración de premios</div>
        <RewardsConfig rewards={rewards} products={products} onSaved={loadOverview} />
      </div>

      {redeeming && (
        <RedeemModal grant={redeeming.grant} customer={redeeming.customer} burgerChoices={burgerChoices} onClose={() => setRedeeming(null)} onDone={afterRedeem} />
      )}
    </div>
  );
}
