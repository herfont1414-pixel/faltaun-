"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useCart } from "@/components/menu/cart-context";
import { buildOrderWhatsAppLink } from "@/lib/whatsapp";
import { useBusinessConfig } from "@/lib/use-business-config";
import { LocationPicker } from "@/components/geo/location-picker";
import type { LatLng } from "@/lib/geo";

interface Zone {
  id: number;
  name: string;
  cost: number;
}

interface DistanceInfo {
  enabled: boolean;
  origin?: LatLng;
  rings?: { name: string; cost: number; maxKm: number }[];
  maxKm?: number;
}

type PayMethod = "efectivo" | "transferencia";

type Quote =
  | { status: "ok"; km: number; zoneName: string; cost: number }
  | { status: "out_of_range"; km: number; maxKm: number }
  | { status: "unavailable" }
  | null;

const PHONE_KEY = "madero_customer_phone";
const NAME_KEY = "madero_customer_name";
const ADDRESS_KEY = "madero_customer_address";

function slotLabel(value: string) {
  if (!value || value === "lo_antes_posible") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

interface CheckoutPanelProps {
  onClose?: () => void;
}

export function CheckoutPanel({ onClose }: CheckoutPanelProps) {
  const { items, changeQty, total, clear, fulfillment, setFulfillment, scheduledTime } = useCart();
  const businessConfig = useBusinessConfig();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneName, setZoneName] = useState("");
  const [distance, setDistance] = useState<DistanceInfo>({ enabled: false });
  const [point, setPoint] = useState<LatLng | null>(null);
  const [quote, setQuote] = useState<Quote>(null);
  const [payMethod, setPayMethod] = useState<PayMethod | null>(null);
  const [copied, setCopied] = useState(false);
  // El total se guarda al enviar: después el carrito se vacía y ya no se puede recalcular.
  const [sentTotal, setSentTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [lookupMsg, setLookupMsg] = useState("");

  useEffect(() => {
    try {
      setName(localStorage.getItem(NAME_KEY) ?? "");
      setPhone(localStorage.getItem(PHONE_KEY) ?? "");
      setAddress(localStorage.getItem(ADDRESS_KEY) ?? "");
    } catch {
      // localStorage puede fallar en navegación privada: seguimos con campos vacíos.
    }
    fetch("/api/zones")
      .then((res) => res.json())
      .then((data: { zones: Zone[]; distance?: DistanceInfo }) => {
        setZones(data.zones ?? []);
        setDistance(data.distance ?? { enabled: false });
      });
  }, []);

  // Vista previa del envío al marcar la dirección. El precio real lo vuelve a
  // calcular el servidor al enviar el pedido.
  useEffect(() => {
    if (!distance.enabled || !point) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/delivery-quote?lat=${point.lat}&lng=${point.lng}`)
      .then((res) => res.json())
      .then((data: Quote) => !cancelled && setQuote(data))
      .catch(() => !cancelled && setQuote(null));
    return () => {
      cancelled = true;
    };
  }, [distance.enabled, point?.lat, point?.lng]);

  async function lookupPhone(value: string) {
    setPhone(value);
    setLookupMsg("");
    if (value.trim().length < 6) return;
    const res = await fetch(`/api/customer/${encodeURIComponent(value.trim())}`);
    const data = await res.json();
    if (data.customer) {
      if (!name.trim()) setName(data.customer.name);
      if (data.customer.address) setAddress(data.customer.address);
      setLookupMsg("Te reconocimos · datos cargados");
    }
  }

  const byDistance = distance.enabled;
  const shippingCost =
    fulfillment !== "delivery"
      ? 0
      : byDistance
        ? quote?.status === "ok"
          ? quote.cost
          : 0
        : zones.find((z) => z.name === zoneName)?.cost ?? 0;
  const resolvedZone = byDistance ? (quote?.status === "ok" ? quote.zoneName : null) : zoneName || null;
  const grandTotal = total + shippingCost;
  const transferAlias = businessConfig?.transferAlias?.trim() ?? "";

  async function copyAlias() {
    try {
      await navigator.clipboard.writeText(transferAlias);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // sin portapapeles el cliente puede copiarlo a mano: el alias está a la vista.
    }
  }
  const timeLabel = slotLabel(scheduledTime);

  async function submit() {
    if (!name.trim() || !phone.trim()) {
      setError("Completá tu nombre y tu WhatsApp");
      return;
    }
    if (fulfillment === "delivery" && !address.trim()) {
      setError("Completá la dirección de entrega");
      return;
    }
    if (!payMethod) {
      setError("Elegí cómo vas a pagar: efectivo o transferencia");
      return;
    }
    if (fulfillment === "delivery" && byDistance) {
      if (!point) {
        setError("Marcá tu dirección en el mapa para calcular el envío");
        return;
      }
      if (quote?.status === "out_of_range") {
        setError(`Tu dirección queda fuera de la zona de reparto (hasta ${quote.maxKm} km)`);
        return;
      }
      if (quote?.status !== "ok") {
        setError("Esperá un momento: estamos calculando el envío");
        return;
      }
    }
    setLoading(true);
    setError("");

    // Se abre la pestaña en blanco ACÁ, todavía dentro del gesto síncrono del
    // click: si se espera a que vuelva el fetch antes de abrirla, los
    // navegadores la bloquean como popup. Una vez confirmado el pedido, se la
    // redirige al link de WhatsApp (o se la cierra si algo falla).
    const waWindow = window.open("", "_blank");

    const scheduleNote = timeLabel ? `Horario pedido: ${timeLabel}` : null;
    const fullNotes = [scheduleNote, notes.trim() || null].filter(Boolean).join(" · ") || null;
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: name,
        customerPhone: phone,
        notes: fullNotes,
        items: items.map((it) => ({ name: it.name, qty: it.qty })),
        fulfillment,
        paymentMethod: payMethod,
        customerAddress: fulfillment === "delivery" ? address : null,
        deliveryZone: fulfillment === "delivery" ? resolvedZone : null,
        deliveryLat: fulfillment === "delivery" && byDistance ? point?.lat ?? null : null,
        deliveryLng: fulfillment === "delivery" && byDistance ? point?.lng ?? null : null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      waWindow?.close();
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No pudimos enviar tu pedido");
      return;
    }
    try {
      localStorage.setItem(PHONE_KEY, phone.trim());
      localStorage.setItem(NAME_KEY, name.trim());
      if (address.trim()) localStorage.setItem(ADDRESS_KEY, address.trim());
    } catch {
      // sin persistencia local, el pedido ya se envió igual.
    }

    const waLink = buildOrderWhatsAppLink({
      customerName: name.trim(),
      items,
      fulfillment,
      address: fulfillment === "delivery" ? address : null,
      zone: fulfillment === "delivery" ? resolvedZone : null,
      scheduleLabel: timeLabel,
      subtotal: total,
      shippingCost,
      total: grandTotal,
      notes: notes.trim() || null,
      paymentMethod: payMethod,
      transferAlias: transferAlias || null,
      businessNumber: businessConfig?.whatsappNumber || undefined,
    });
    if (waWindow) waWindow.location.href = waLink;
    else window.open(waLink, "_blank");

    setSentTotal(grandTotal);
    setSent(true);
    clear();
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-xl text-stone-50">{sent ? "¡Pedido enviado!" : "Tu pedido"}</h3>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-full bg-white/5 p-1.5">
            <X className="h-4 w-4 text-stone-300" />
          </button>
        )}
      </div>

      {sent ? (
        <div className="py-6 text-center text-sm text-stone-300">
          <p>
            Te abrimos WhatsApp con el resumen de tu pedido — mandanos el mensaje para confirmarlo. Te
            avisamos el tiempo de espera por ahí mismo. ¡Gracias!
          </p>
          {payMethod === "transferencia" && transferAlias && (
            <div className="mt-4 rounded-lg border border-white/10 p-3 text-left">
              <p className="text-xs text-stone-400">Para terminar, transferí ${sentTotal.toLocaleString("es-AR")} al alias:</p>
              <p className="mt-1 text-lg font-semibold text-stone-50">{transferAlias}</p>
              {businessConfig?.transferHolder && (
                <p className="text-xs text-stone-400">Titular: {businessConfig.transferHolder}</p>
              )}
              <p className="mt-2 text-xs text-stone-400">Mandanos el comprobante por el mismo chat de WhatsApp.</p>
              <button
                type="button"
                onClick={copyAlias}
                className="mt-3 w-full rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-stone-200 hover:border-white/25"
              >
                {copied ? "¡Alias copiado!" : "Copiar alias"}
              </button>
            </div>
          )}
          {payMethod === "efectivo" && (
            <p className="mt-3 text-xs text-stone-400">
              {fulfillment === "delivery"
                ? "Pagás en efectivo al repartidor cuando te entregue el pedido."
                : "Pagás en efectivo en el local cuando retirás tu pedido."}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 space-y-2">
            {items.map((it) => (
              <div key={it.name} className="flex items-center gap-3 text-sm">
                <div className="qty-ctrl flex items-center gap-1 rounded-lg bg-white/5 p-1">
                  <button
                    type="button"
                    onClick={() => changeQty(it.name, -1)}
                    className="h-6 w-6 rounded bg-white/10 font-bold text-stone-100"
                  >
                    −
                  </button>
                  <span className="min-w-[16px] text-center font-semibold">{it.qty}</span>
                  <button
                    type="button"
                    onClick={() => changeQty(it.name, 1)}
                    className="h-6 w-6 rounded bg-white/10 font-bold text-stone-100"
                  >
                    +
                  </button>
                </div>
                <span className="flex-1 text-stone-200">{it.name}</span>
                <span className="font-medium text-stone-300">
                  ${(it.price * it.qty).toLocaleString("es-AR")}
                </span>
              </div>
            ))}
          </div>

          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setFulfillment("retiro")}
              className={`flex-1 rounded-full border px-3 py-2 text-sm font-medium transition ${
                fulfillment === "retiro"
                  ? "border-ember bg-ember text-base"
                  : "border-white/10 text-stone-300 hover:border-white/25"
              }`}
            >
              Retirar en el local
            </button>
            <button
              type="button"
              onClick={() => setFulfillment("delivery")}
              className={`flex-1 rounded-full border px-3 py-2 text-sm font-medium transition ${
                fulfillment === "delivery"
                  ? "border-ember bg-ember text-base"
                  : "border-white/10 text-stone-300 hover:border-white/25"
              }`}
            >
              Delivery
            </button>
          </div>
          {timeLabel && <p className="-mt-2 mb-4 text-xs text-stone-500">Horario elegido: {timeLabel}</p>}

          <div className="space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2.5 text-sm text-stone-100 outline-none placeholder:text-stone-500"
            />
            <input
              value={phone}
              onChange={(e) => lookupPhone(e.target.value)}
              placeholder="Tu WhatsApp (ej: 5493751123456)"
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2.5 text-sm text-stone-100 outline-none placeholder:text-stone-500"
            />
            {lookupMsg && <p className="px-1 text-xs text-ember-soft">{lookupMsg}</p>}

            {fulfillment === "delivery" && (
              <>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Dirección de entrega (calle y número)"
                  className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2.5 text-sm text-stone-100 outline-none placeholder:text-stone-500"
                />
                {byDistance ? (
                  <div>
                    <LocationPicker
                      query={address}
                      value={point}
                      onChange={setPoint}
                      origin={distance.origin}
                      rings={distance.rings?.map((r) => r.maxKm)}
                      buttonClassName="w-full rounded-lg border border-white/10 px-3 py-2.5 text-sm font-medium text-stone-200 transition hover:border-white/25 disabled:opacity-50"
                      hintClassName="px-1 pt-1 text-xs text-stone-500"
                      listClassName="mt-1 overflow-hidden rounded-lg border border-white/10 bg-base-card text-sm"
                      itemClassName="block w-full px-3 py-2 text-left text-stone-200 hover:bg-white/5"
                    />
                    {quote?.status === "ok" && (
                      <p className="mt-2 text-sm text-ember-soft">
                        A {quote.km.toLocaleString("es-AR")} km · envío ${quote.cost.toLocaleString("es-AR")}
                      </p>
                    )}
                    {quote?.status === "out_of_range" && (
                      <p className="mt-2 text-sm text-red-400">
                        Estás a {quote.km.toLocaleString("es-AR")} km: queda fuera de la zona de reparto (hasta{" "}
                        {quote.maxKm} km).
                      </p>
                    )}
                    {distance.rings && !quote && (
                      <p className="mt-2 text-xs text-stone-500">
                        Envío:{" "}
                        {distance.rings
                          .map((r) => `hasta ${r.maxKm} km $${r.cost.toLocaleString("es-AR")}`)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                ) : (
                  zones.length > 0 && (
                    <select
                      value={zoneName}
                      onChange={(e) => setZoneName(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-base-card px-3 py-2.5 text-sm text-stone-100 outline-none"
                    >
                      <option value="">Elegí tu zona</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.name}>
                          {z.name} · envío ${z.cost.toLocaleString("es-AR")}
                        </option>
                      ))}
                    </select>
                  )
                )}
              </>
            )}

            <div className="pt-1">
              <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-stone-400">¿Cómo vas a pagar?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPayMethod("efectivo");
                    setError("");
                  }}
                  className={`flex-1 rounded-full border px-3 py-2 text-sm font-medium transition ${
                    payMethod === "efectivo"
                      ? "border-ember bg-ember text-base"
                      : "border-white/10 text-stone-300 hover:border-white/25"
                  }`}
                >
                  Efectivo
                </button>
                {transferAlias && (
                  <button
                    type="button"
                    onClick={() => {
                      setPayMethod("transferencia");
                      setError("");
                    }}
                    className={`flex-1 rounded-full border px-3 py-2 text-sm font-medium transition ${
                      payMethod === "transferencia"
                        ? "border-ember bg-ember text-base"
                        : "border-white/10 text-stone-300 hover:border-white/25"
                    }`}
                  >
                    Transferencia
                  </button>
                )}
              </div>
              {payMethod === "efectivo" && (
                <p className="mt-2 px-1 text-xs text-stone-400">
                  {fulfillment === "delivery"
                    ? "Le pagás en efectivo al repartidor cuando te entregue el pedido."
                    : "Pagás en efectivo en el local cuando retirás tu pedido."}
                </p>
              )}
              {payMethod === "transferencia" && transferAlias && (
                <div className="mt-2 rounded-lg border border-white/10 p-3">
                  <p className="text-xs text-stone-400">
                    Transferí ${grandTotal.toLocaleString("es-AR")} al alias:
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-base font-semibold text-stone-50">{transferAlias}</span>
                    <button
                      type="button"
                      onClick={copyAlias}
                      className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-stone-200 hover:border-white/25"
                    >
                      {copied ? "¡Copiado!" : "Copiar"}
                    </button>
                  </div>
                  {businessConfig?.transferHolder && (
                    <p className="text-xs text-stone-400">Titular: {businessConfig.transferHolder}</p>
                  )}
                  <p className="mt-2 text-xs text-stone-400">
                    Al enviar el pedido se abre WhatsApp: mandanos ahí el comprobante.
                  </p>
                </div>
              )}
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas (opcional)"
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2.5 text-sm text-stone-100 outline-none placeholder:text-stone-500"
            />
          </div>

          <div className="mt-4 space-y-1 border-t border-white/10 pt-3 text-sm">
            <div className="flex justify-between text-stone-400">
              <span>Subtotal</span>
              <span>${total.toLocaleString("es-AR")}</span>
            </div>
            {fulfillment === "delivery" && (
              <div className="flex justify-between text-stone-400">
                <span>Envío</span>
                <span>${shippingCost.toLocaleString("es-AR")}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-stone-100">
              <span>Total</span>
              <span>${grandTotal.toLocaleString("es-AR")}</span>
            </div>
          </div>

          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="mt-4 w-full rounded-full bg-ember px-5 py-2.5 text-sm font-medium text-base transition hover:bg-ember-soft disabled:opacity-50"
          >
            {loading ? "Enviando..." : "Enviar pedido"}
          </button>
        </>
      )}
    </>
  );
}
