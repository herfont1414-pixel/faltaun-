// Reglas de qué se ofrece en el menú online. Se usan tanto para armar el menú
// público como para validar los pedidos en el servidor, así no pueden divergir.
//
// Modelo de stock de gestion_products:
//   stock_qty = null  → el producto no controla stock (se vende siempre).
//   stock_qty = n     → stock controlado: n unidades.
//   in_stock          → false si está agotado (stock_qty en 0) o si se lo
//                       marcó "sin stock" a mano.
export interface OnlineProductState {
  active: boolean;
  showOnline: boolean;
  inStock: boolean;
  stockQty: number | null;
}

// Hay existencias para vender: no está marcado agotado y, si controla stock, queda alguna.
export function hasStock(p: Pick<OnlineProductState, "inStock" | "stockQty">) {
  return p.inStock && (p.stockQty === null || p.stockQty > 0);
}

// Se muestra y se puede comprar desde el menú online.
export function isOnlineAvailable(p: OnlineProductState) {
  return p.active && p.showOnline && hasStock(p);
}
