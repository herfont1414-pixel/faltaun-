import { getPrintableOrder } from "@/lib/admin/print";
import { AutoPrint } from "@/components/admin/auto-print";

export default async function ComandaPage({ params }: { params: { orderId: string } }) {
  const order = await getPrintableOrder(params.orderId);
  const title = order.tableNumber ? `Mesa ${order.tableNumber}` : "Mostrador";
  const time = new Date(order.openedAt).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      style={{
        width: "80mm",
        margin: "0 auto",
        padding: "8px",
        fontFamily: "monospace",
        fontSize: 14,
        color: "#000",
        background: "#fff",
      }}
    >
      <AutoPrint />
      <style>{`@media print { @page { margin: 0; } body { margin: 0; } }`}</style>

      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ textAlign: "center", marginBottom: 10 }}>{time}</div>
      <hr />

      {order.areas.map((area) => {
        const items = order.items.filter((it) => it.area === area);
        if (items.length === 0) return null;
        return (
          <div key={area} style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>— {area.toUpperCase()} —</div>
            {items.map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{item.name}</span>
                <span>x{item.qty}</span>
              </div>
            ))}
          </div>
        );
      })}

      {order.items.length === 0 && (
        <div style={{ textAlign: "center", marginTop: 10 }}>Sin productos enviados</div>
      )}
    </div>
  );
}
