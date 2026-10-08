"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useCart } from "@/components/menu/cart-context";
import { buildOrderWhatsAppLink } from "@/lib/whatsapp";

interface Zone {
  id: number;
  name: string;
  cost: number;
}

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
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneName, setZoneName] = useState("");
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
      .then((data: { zones: Zone[] }) => setZones(data.zones ?? []));
  }, []);

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

  const shippingCost = fulfillment === "delivery" ? zones.find((z) => z.name === zoneName)?.cost ?? 0 : 0;
  const grandTotal = total + shippingCost;
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
        customerAddress: fulfillment === "delivery" ? address : null,
        deliveryZone: fulfillment === "delivery" ? zoneName || null : null,
        shippingCost,
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
      zone: fulfillment === "delivery" ? zoneName || null : null,
      scheduleLabel: timeLabel,
      subtotal: total,
      shippingCost,
      total: grandTotal,
      notes: notes.trim() || null,
    });
    if (waWindow) waWindow.location.href = waLink;
    else window.open(waLink, "_blank");

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
        <p className="py-6 text-center text-sm text-stone-300">
          Te abrimos WhatsApp con el resumen de tu pedido — mandanos el mensaje para confirmarlo. Te
          avisamos el tiempo de espera por ahí mismo. ¡Gracias!
        </p>
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
                {zones.length > 0 && (
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
                )}
              </>
            )}

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
