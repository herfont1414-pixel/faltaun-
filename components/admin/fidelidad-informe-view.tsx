"use client";

import { useEffect, useState } from "react";
import type {
  ConsistencyRow,
  DupGroup,
  DupMember,
  LoyaltyReport,
  SourceLevel,
} from "@/lib/admin/loyalty-report-calc";

const LEVEL_STYLE: Record<SourceLevel, { bg: string; border: string; color: string }> = {
  produccion: { bg: "#e8f6ec", border: "#7bc58f", color: "#1d5a31" },
  preview: { bg: "#fff6e0", border: "#e6b84d", color: "#6b4a00" },
  postgres_externo: { bg: "#fff6e0", border: "#e6b84d", color: "#6b4a00" },
  local: { bg: "#fdeaea", border: "#e08a8a", color: "#7a1f1f" },
  ninguna: { bg: "#fdeaea", border: "#e08a8a", color: "#7a1f1f" },
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="m-section" style={{ marginBottom: 22 }}>
      <div className="m-section-title">{title}</div>
      {hint && <p style={{ fontSize: 13, color: "var(--muted, #6b6b66)", margin: "0 0 10px" }}>{hint}</p>}
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", minWidth: 150, background: "#fff" }}
    >
      <div style={{ fontSize: 12, color: "var(--muted, #6b6b66)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="m-table"><div className="m-empty">{children}</div></div>;
}

function Members({ members }: { members: DupMember[] }) {
  return (
    <>
      {members.map((m) => (
        <div key={m.phone} style={{ fontSize: 13 }}>
          <strong>{m.phone}</strong> · {m.name || "Sin nombre"} · {m.stamps} sellos · {m.orderCount} pedidos
        </div>
      ))}
    </>
  );
}

function DupTable({ groups }: { groups: DupGroup[] }) {
  return (
    <table className="m-table">
      <thead>
        <tr>
          <th>Cuentas parecidas</th>
          <th style={{ textAlign: "right" }}>Sellos sumados</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <tr key={g.key}>
            <td><Members members={g.members} /></td>
            <td style={{ textAlign: "right" }}>{g.stampsSum}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ConsistencyTable({ rows }: { rows: ConsistencyRow[] }) {
  return (
    <table className="m-table">
      <thead>
        <tr>
          <th>Cliente</th>
          <th>Teléfono</th>
          <th style={{ textAlign: "right" }}>Sellos en la cuenta</th>
          <th style={{ textAlign: "right" }}>Sellos en el historial</th>
          <th style={{ textAlign: "right" }}>Transacciones</th>
          <th style={{ textAlign: "right" }}>Diferencia</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.phone}>
            <td>{r.name || "Sin nombre"}</td>
            <td>{r.phone}</td>
            <td style={{ textAlign: "right" }}>{r.stamps}</td>
            <td style={{ textAlign: "right" }}>{r.txStamps}</td>
            <td style={{ textAlign: "right" }}>{r.txCount}</td>
            <td style={{ textAlign: "right" }}>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FidelidadInformeView() {
  const [report, setReport] = useState<LoyaltyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    setReport(null);
    fetch("/api/admin/loyalty-report", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "No se pudo generar el informe");
        setReport(data.report as LoyaltyReport);
      })
      .catch((e: Error) => setError(e.message));
  }

  useEffect(load, []);

  if (error) {
    return (
      <div className="mostrador">
        <h1 style={{ marginBottom: 14 }}>Fidelidad · Informe</h1>
        <p>{error}</p>
        <button type="button" className="btn" onClick={load}>Reintentar</button>
      </div>
    );
  }
  if (!report) return <div className="mostrador">Generando informe…</div>;

  const { source, fingerprint: fp, retroactive: retro, legacy, duplicates: dup, consistency: cons } = report;
  const style = LEVEL_STYLE[source.level];

  return (
    <div className="mostrador">
      <h1 style={{ marginBottom: 6 }}>Fidelidad · Informe</h1>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--muted, #6b6b66)" }}>
        Informe de <strong>solo lectura</strong>: no crea premios, no cambia sellos, teléfonos ni cuentas y no
        combina clientes. Generado el {fmtDate(report.generatedAt).replace(/\.$/, "")}.
      </p>

      <div
        style={{ border: `1px solid ${style.border}`, background: style.bg, color: style.color, borderRadius: 10, padding: "12px 14px", marginBottom: 18 }}
      >
        <div style={{ fontWeight: 700 }}>Origen de los datos: {source.label}</div>
        {source.warning && <div style={{ marginTop: 4 }}>{source.warning}</div>}
        <div style={{ marginTop: 6, fontSize: 13 }}>
          {source.host && <>Servidor: <strong>{source.host}</strong>{source.database ? <> · base: <strong>{source.database}</strong></> : null} · </>}
          {source.file && <>Archivo: <strong>{source.file}</strong> · </>}
          Entorno Vercel: <strong>{source.vercelEnv ?? "no aplica"}</strong>
        </div>
        <div style={{ marginTop: 6, fontSize: 13 }}>
          Para confirmar que son los datos reales: {fp.accounts} cuentas · {fp.totalStamps} sellos · {fp.transactions} transacciones ·
          última actividad en cuentas {fmtDate(fp.lastAccountUpdate)} · última transacción {fmtDate(fp.lastTransaction)}. Cotejalo con la
          pantalla Clientes y con el servidor de la base en el panel de Vercel.
        </div>
      </div>

      <Section title="Resumen">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Stat label="Cuentas de fidelidad" value={fp.accounts} />
          <Stat label="Clientes con algún premio nuevo" value={retro.clientsWithAny} />
          <Stat label="Premios de papas (nuevos)" value={retro.totalPapas} />
          <Stat label="Premios de hamburguesa (nuevos)" value={retro.totalBurgers} />
          <Stat label="Canjes del sistema anterior" value={legacy.totalRedeemed} />
          <Stat label="Posibles duplicados" value={dup.sameNumber.length + dup.ambiguous.length} />
          <Stat label="Diferencias de consistencia" value={cons.withoutHistory.length + cons.mismatched.length + cons.orphanTransactions.length} />
        </div>
      </Section>

      <Section
        title="1 · Posibles premios nuevos (reglas nuevas)"
        hint="Papas fritas en los hitos 5, 20, 35… y hamburguesa simple en 15, 30, 45… Es solo una proyección según los sellos actuales (incluye hitos ya pasados): no se genera ningún premio y no coincide necesariamente con los premios reales ya generados."
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <Stat label="Clientes con papas" value={retro.clientsWithPapas} />
          <Stat label="Clientes con hamburguesa" value={retro.clientsWithBurger} />
          <Stat label="Premios en total" value={retro.totalRewards} />
        </div>
        {retro.rows.length === 0 ? (
          <Empty>Ningún cliente alcanzó todavía un hito.</Empty>
        ) : (
          <table className="m-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Teléfono</th>
                <th style={{ textAlign: "right" }}>Sellos</th>
                <th style={{ textAlign: "right" }}>🍟 Papas</th>
                <th>Hitos de papas</th>
                <th style={{ textAlign: "right" }}>🍔 Hamburguesas</th>
                <th>Hitos de hamburguesa</th>
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {retro.rows.map((r) => (
                <tr key={r.phone}>
                  <td>{r.name || "Sin nombre"}</td>
                  <td>{r.phone}</td>
                  <td style={{ textAlign: "right" }}>{r.stamps}</td>
                  <td style={{ textAlign: "right" }}>{r.papas}</td>
                  <td>{r.papasHitos.join(", ") || "—"}</td>
                  <td style={{ textAlign: "right" }}>{r.burgers}</td>
                  <td>{r.burgerHitos.join(", ") || "—"}</td>
                  <td className="m-total">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title="2 · Canjes registrados en el sistema anterior"
        hint="Dato histórico del campo «canjeados» (regla vieja: un premio cada 10 sellos). NO equivale a los premios nuevos de arriba y no se descuenta de ellos automáticamente: es una decisión a tomar aparte."
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <Stat label="Canjes registrados" value={legacy.totalRedeemed} />
          <Stat label="Cuentas con canjes" value={legacy.accountsWithRedeemed} />
          <Stat label="Premios «de a 10» que daba la regla vieja (informativo)" value={legacy.legacyEarnedTotal} />
        </div>
        {legacy.rows.length === 0 ? (
          <Empty>No hay canjes registrados en el sistema anterior.</Empty>
        ) : (
          <table className="m-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Teléfono</th>
                <th style={{ textAlign: "right" }}>Sellos</th>
                <th style={{ textAlign: "right" }}>Canjes registrados</th>
                <th style={{ textAlign: "right" }}>Premios de a 10 (informativo)</th>
              </tr>
            </thead>
            <tbody>
              {legacy.rows.map((r) => (
                <tr key={r.phone}>
                  <td>{r.name || "Sin nombre"}</td>
                  <td>{r.phone}</td>
                  <td style={{ textAlign: "right" }}>{r.stamps}</td>
                  <td style={{ textAlign: "right" }}>{r.redeemed}</td>
                  <td style={{ textAlign: "right" }}>{r.legacyEarned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title="3 · Posibles cuentas duplicadas por teléfono"
        hint="No se combina nada. Es una lista para que decidas caso por caso."
      >
        <h3 style={{ fontSize: 14, margin: "6px 0" }}>Mismo número cargado con distinto formato (casi seguro la misma persona)</h3>
        {dup.sameNumber.length === 0 ? <Empty>Sin casos.</Empty> : <DupTable groups={dup.sameNumber} />}
        <h3 style={{ fontSize: 14, margin: "14px 0 6px" }}>Parecidos pero ambiguos (terminan igual; revisar a mano)</h3>
        {dup.ambiguous.length === 0 ? <Empty>Sin casos.</Empty> : <DupTable groups={dup.ambiguous} />}
        <h3 style={{ fontSize: 14, margin: "14px 0 6px" }}>Formatos de teléfono a tener en cuenta</h3>
        <p style={{ fontSize: 13, margin: 0 }}>
          Con símbolos o espacios: <strong>{dup.formats.withSymbols.length}</strong> · Muy cortos (menos de 8 dígitos):{" "}
          <strong>{dup.formats.tooShort.length}</strong> · Que no quedan como móvil argentino de 13 dígitos:{" "}
          <strong>{dup.formats.otherFormat.length}</strong>
        </p>
        {(dup.formats.tooShort.length > 0 || dup.formats.otherFormat.length > 0) && (
          <table className="m-table" style={{ marginTop: 8 }}>
            <thead>
              <tr><th>Teléfono</th><th>Cliente</th><th>Normalizado</th><th style={{ textAlign: "right" }}>Sellos</th></tr>
            </thead>
            <tbody>
              {[...dup.formats.tooShort, ...dup.formats.otherFormat].map((m) => (
                <tr key={m.phone}>
                  <td>{m.phone}</td>
                  <td>{m.name || "Sin nombre"}</td>
                  <td>{m.normalized || "—"}</td>
                  <td style={{ textAlign: "right" }}>{m.stamps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title="4 · Control de consistencia (sellos de la cuenta vs. transacciones)"
        hint="Compara los sellos guardados en cada cuenta con la suma de las transacciones de sello. Solo se muestran las diferencias; no se corrige nada."
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <Stat label="Cuentas revisadas" value={cons.accountsChecked} />
          <Stat label="Coinciden" value={cons.consistent} />
          <Stat label="Sin historial" value={cons.withoutHistory.length} />
          <Stat label="No coinciden" value={cons.mismatched.length} />
          <Stat label="Transacciones sin cuenta" value={cons.orphanTransactions.length} />
        </div>
        <h3 style={{ fontSize: 14, margin: "6px 0" }}>Sellos que no coinciden con el historial</h3>
        {cons.mismatched.length === 0 ? <Empty>Sin diferencias.</Empty> : <ConsistencyTable rows={cons.mismatched} />}
        <h3 style={{ fontSize: 14, margin: "14px 0 6px" }}>Cuentas con sellos pero sin transacciones (suele ser anterior al historial)</h3>
        {cons.withoutHistory.length === 0 ? <Empty>Sin casos.</Empty> : <ConsistencyTable rows={cons.withoutHistory} />}
        <h3 style={{ fontSize: 14, margin: "14px 0 6px" }}>Transacciones de teléfonos sin cuenta</h3>
        {cons.orphanTransactions.length === 0 ? (
          <Empty>Sin casos.</Empty>
        ) : (
          <table className="m-table">
            <thead>
              <tr><th>Teléfono</th><th style={{ textAlign: "right" }}>Transacciones</th><th style={{ textAlign: "right" }}>Sellos</th></tr>
            </thead>
            <tbody>
              {cons.orphanTransactions.map((t) => (
                <tr key={t.phone}>
                  <td>{t.phone}</td>
                  <td style={{ textAlign: "right" }}>{t.txCount}</td>
                  <td style={{ textAlign: "right" }}>{t.txStamps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 12, color: "var(--muted, #6b6b66)", marginTop: 8 }}>
          Tipos de transacción en el historial:{" "}
          {fp.transactionTypes.length === 0 ? "ninguna" : fp.transactionTypes.map((t) => `${t.type}: ${t.count}`).join(" · ")}
        </p>
      </Section>
    </div>
  );
}
