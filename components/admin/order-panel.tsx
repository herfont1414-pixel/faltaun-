"use client";

import { osmLink } from "@/lib/geo";
import { useEffect, useRef, useState } from "react";
import { X, Printer, Pencil, ChevronDown } from "lucide-react";
import { openedSince } from "@/lib/admin/format";
import { money } from "@/lib/admin/format";
import { PaymentPicker } from "@/components/admin/payment-picker";
import type { Catalog, Order, OrderPayment } from "@/lib/admin/types";

function plain(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Todas las palabras escritas tienen que aparecer en el nombre. Primero los que
// empiezan con lo escrito, después los que tienen una palabra que empieza igual,
// y al final el resto; dentro de cada grupo, el orden de la carta.
function searchProducts(catalog: Catalog, query: string) {
  const words = plain(query).split(/\s+/).filter(Boolean);
  const rank = (name: string) => {
    const n = plain(name);
    if (!words.every((w) => n.includes(w))) return -1;
    if (n.startsWith(words[0])) return 0;
    return n.split(/\s+/).some((token) => token.startsWith(words[0])) ? 1 : 2;
  };
  return Object.values(catalog)
    .flat()
    .map((product, index) => ({ product, index, r: rank(product.name) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.index - b.index)
    .map((x) => x.product);
}

interface OrderPanelProps {
  order: Order | null;
  tableNumber: number | null;
  titleOverride?: string | null;
  catalog: Catalog;
  activeCategory: string;
  onChangeCategory: (category: string) => void;
  onAddProduct: (productId: number) => void;
  onChangeQty: (itemId: string, delta: number) => void;
  onClose: () => void;
  onSendKitchen: () => void;
  onRequestBill: () => void;
  onFinalize: (payments: OrderPayment[], customerId: number | null, loyaltyPhone: string | null) => void;
  onChangeDeliveryStatus?: (status: "preparando" | "en_camino" | "entregado") => void;
  onChangeNotes: (notes: string) => void;
  onChangeItemNote: (itemId: string, note: string) => void;
  onPrintTicket: () => void;
  // Solo mesas: abre "Editar mesa" (personas, cliente, mozo).
  onEditTable?: () => void;
}

// Preferencia de cada PC: mostrar u ocultar la carta por categorías (en PC arranca oculta,
// porque los productos se cargan sobre todo con el buscador).
const CATALOG_KEY = "madero_pos_catalog_open";

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  preparando: "Preparando",
  en_camino: "En camino",
  entregado: "Entregado",
};

export function OrderPanel({
  order,
  tableNumber,
  titleOverride,
  catalog,
  activeCategory,
  onChangeCategory,
  onAddProduct,
  onChangeQty,
  onClose,
  onSendKitchen,
  onRequestBill,
  onFinalize,
  onChangeDeliveryStatus,
  onChangeNotes,
  onChangeItemNote,
  onPrintTicket,
  onEditTable,
}: OrderPanelProps) {
  const [showPayment, setShowPayment] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState(order?.notes ?? "");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setCatalogOpen(localStorage.getItem(CATALOG_KEY) === "1");
    } catch {
      // sin localStorage: queda oculta
    }
  }, []);

  function toggleCatalog() {
    setCatalogOpen((open) => {
      try {
        localStorage.setItem(CATALOG_KEY, open ? "0" : "1");
      } catch {
        // no se guarda la preferencia, pero igual se abre/cierra
      }
      return !open;
    });
  }

  useEffect(() => {
    setSearch("");
    setSheetOpen(false);
    setShowPayment(false);
    setNotesDraft(order?.notes ?? "");
    setEditingItemId(null);
    setNotesOpen(false);
  }, [order?.id]);

  if (!order) {
    return (
      <div className="side-panel">
        <div className="empty-hint">‹ Seleccioná una mesa</div>
      </div>
    );
  }

  const categories = Object.keys(catalog);
  // Buscador: mientras se escribe, muestra los productos de TODAS las categorías que
  // coinciden (sin importar mayúsculas ni tildes); los que empiezan igual van primero.
  const searching = search.trim() !== "";
  const found = searching ? searchProducts(catalog, search) : catalog[activeCategory] ?? [];
  // Los que no tienen stock van al final, así lo que se puede cargar queda arriba.
  const products = [...found].sort((a, b) => Number(!a.inStock) - Number(!b.inStock));
  const itemCount = order.items.reduce((sum, it) => sum + it.qty, 0);

  // Al cargar un producto desde el buscador, el buscador se limpia y queda listo para el siguiente.
  function addProduct(productId: number) {
    onAddProduct(productId);
    if (searching) {
      setSearch("");
      searchRef.current?.focus();
    }
  }

  function saveNotes() {
    if (notesDraft !== (order!.notes ?? "")) onChangeNotes(notesDraft);
  }

  return (
    <div className="side-panel show">
      <div className="order-panel">
        <div className="op-header">
          <div>
            <div className="op-title">
              {titleOverride ?? (tableNumber ? `Mesa ${tableNumber}` : "Pedido de mostrador")}
            </div>
            <div className="op-sub">
              {order.items.length} producto(s)
              {tableNumber && order.partySize ? ` · ${order.partySize} persona${order.partySize === 1 ? "" : "s"}` : ""}
              {tableNumber && order.waiter ? ` · Mozo: ${order.waiter}` : ""}
            </div>
            {tableNumber && (
              <div className="op-sub">
                {order.customerName ? `${order.customerName} · ` : ""}Abierta {openedSince(order.openedAt)}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {tableNumber && onEditTable && (
              <button type="button" className="op-edit" onClick={onEditTable}>
                <Pencil className="h-3.5 w-3.5" />
                Editar mesa
              </button>
            )}
            <button type="button" className="op-close" onClick={onClose}>
              <X className="mx-auto h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="prod-search">
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              // Enter carga el primer resultado disponible; Escape limpia la búsqueda.
              if (e.key === "Enter") {
                const first = products.find((p) => p.inStock);
                if (searching && first) addProduct(first.id);
              } else if (e.key === "Escape") {
                setSearch("");
              }
            }}
            placeholder="Buscar producto (Enter agrega)"
            aria-label="Buscar producto"
            className="caja-input"
          />
          {searching && (
            <button type="button" className="prod-search-clear" onClick={() => setSearch("")} aria-label="Borrar búsqueda">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <button type="button" className="catalog-toggle" onClick={toggleCatalog} aria-expanded={catalogOpen}>
          <span>{catalogOpen ? "Ocultar carta por categorías" : "Ver carta por categorías"}</span>
          <ChevronDown className={`h-4 w-4 transition ${catalogOpen ? "rotate-180" : ""}`} />
        </button>

        <div className={`catalog ${catalogOpen ? "open" : ""} ${searching ? "searching" : ""}`}>
          {!searching && categories.length > 1 && (
            <div className="cat-tabs">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`cat-tab ${cat === activeCategory ? "active" : ""}`}
                  onClick={() => onChangeCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          <div className="product-list">
            {searching && products.length === 0 && (
              <div style={{ gridColumn: "1 / -1", fontSize: 13, color: "var(--text-dim)", padding: "6px 2px" }}>
                No hay productos que coincidan con &ldquo;{search.trim()}&rdquo;.
              </div>
            )}
            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                className={`product-btn ${product.inStock ? "" : "sin-stock"}`}
                disabled={!product.inStock}
                onClick={() => addProduct(product.id)}
              >
                <div className="p-name">{product.name}</div>
                <div className="p-price">{product.inStock ? money(product.price) : "Sin stock"}</div>
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="mobile-cart-bar" onClick={() => setSheetOpen(true)}>
          <span>
            Ver pedido ({itemCount} ítem{itemCount === 1 ? "" : "s"})
          </span>
          <span>{money(order.total)}</span>
        </button>

        {sheetOpen && <div className="sheet-backdrop" onClick={() => setSheetOpen(false)} />}

        <div className={`order-ticket ${sheetOpen ? "sheet-open" : ""}`}>
          <div className="sheet-handle" onClick={() => setSheetOpen(false)} />

          {order.isDelivery && (
            <div className="delivery-info">
              <div>
                {order.customerName}
                {order.customerPhone ? ` · ${order.customerPhone}` : ""}
              </div>
              <div>
                {order.customerAddress || "Sin dirección cargada"}
                {order.deliveryLat !== null && order.deliveryLng !== null && (
                  <>
                    {" · "}
                    <a
                      href={osmLink({ lat: order.deliveryLat, lng: order.deliveryLng })}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--accent, #ff5a1f)", fontWeight: 600 }}
                    >
                      Ver en mapa
                    </a>
                  </>
                )}
              </div>
              {order.deliveryZone && (
                <div>
                  Zona: {order.deliveryZone} · Envío {money(order.shippingCost)}
                </div>
              )}
              {onChangeDeliveryStatus && (
                <div className="delivery-status-row">
                  {(["preparando", "en_camino", "entregado"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`btn btn-sm ${order.deliveryStatus === status ? "active" : ""}`}
                      onClick={() => onChangeDeliveryStatus(status)}
                    >
                      {DELIVERY_STATUS_LABEL[status]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="ticket-wrap">
            <div className="ticket-title">Pedido actual</div>
            {order.items.length === 0 ? (
              <div className="ticket-empty">Todavía no agregaste productos</div>
            ) : (
              order.items.map((item) => {
                const isEditingNote = editingItemId === item.id;
                return (
                  <div key={item.id} className="ticket-item-wrap">
                    <div className="ticket-item">
                      <div className="qty-ctrl">
                        <button type="button" onClick={() => onChangeQty(item.id, -1)}>
                          −
                        </button>
                        <span>{item.qty}</span>
                        <button type="button" onClick={() => onChangeQty(item.id, 1)}>
                          +
                        </button>
                      </div>
                      <div className="ti-name">
                        {item.name}
                        {item.sentToKitchen && <span style={{ color: "var(--text-faint)" }}> · enviado</span>}
                        {item.note && !isEditingNote && <div className="ti-note">{item.note}</div>}
                      </div>
                      <div className="ti-price">{money(item.price * item.qty)}</div>
                      <button
                        type="button"
                        className={`ti-note-btn ${item.note ? "has-note" : ""}`}
                        aria-label="Nota del producto"
                        onClick={() => setEditingItemId(isEditingNote ? null : item.id)}
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                    {isEditingNote && (
                      <div className="ti-note-edit">
                        <input
                          autoFocus
                          defaultValue={item.note ?? ""}
                          placeholder="Ej: sin sal, bien cocido..."
                          onBlur={(e) => {
                            onChangeItemNote(item.id, e.target.value);
                            setEditingItemId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {order.isDelivery && order.shippingCost > 0 && (
              <div className="ticket-item">
                <div />
                <div className="ti-name">Envío</div>
                <div className="ti-price">{money(order.shippingCost)}</div>
              </div>
            )}
          </div>

          <div className="notes-field">
            {notesOpen ? (
              <>
                <div className="notes-label">Notas del pedido</div>
                <textarea
                  autoFocus
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={() => {
                    saveNotes();
                    setNotesOpen(false);
                  }}
                  placeholder="Ej: sin cebolla, alergia a maní..."
                  rows={2}
                />
              </>
            ) : (
              <button type="button" className={`notes-toggle ${notesDraft ? "has-note" : ""}`} onClick={() => setNotesOpen(true)}>
                {notesDraft ? <>📝 {notesDraft}</> : "+ Agregar nota al pedido"}
              </button>
            )}
          </div>

          {showPayment ? (
            <PaymentPicker
              total={order.total}
              hint={order.paymentHint}
              onCancel={() => setShowPayment(false)}
              onConfirm={(payments, customerId, loyaltyPhone) => {
                setShowPayment(false);
                setSheetOpen(false);
                onFinalize(payments, customerId, loyaltyPhone);
              }}
              onPartial={() => {
                setShowPayment(false);
                onPrintTicket();
              }}
            />
          ) : (
            <div className="op-footer">
              <div className="footer-actions">
                <button type="button" className="btn" onClick={onSendKitchen}>
                  Enviar a cocina
                </button>
                <button type="button" className="btn btn-icon" onClick={onPrintTicket}>
                  <Printer className="h-4 w-4" />
                  Imprimir
                </button>
                {tableNumber && (
                  <button type="button" className="btn" onClick={onRequestBill}>
                    Pedir cuenta
                  </button>
                )}
              </div>
              <div className="footer-actions footer-row2">
                <button type="button" className="btn btn-primary btn-cobrar" onClick={() => setShowPayment(true)}>
                  Cobrar {money(order.total)}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
