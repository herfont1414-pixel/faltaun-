import dynamic from "next/dynamic";

export const metadata = {
  title: "Cocina | MaderoSys",
};

// Pantalla pensada para quedar siempre abierta en una PC/TV de la cocina —
// se renderiza solo en el cliente para evitar mismatches de hidratación con
// el reloj/temporizador (que dependen de la hora exacta de cada visitante).
const KdsBoard = dynamic(() => import("@/components/admin/kds-board").then((m) => m.KdsBoard), {
  ssr: false,
});

export default function KdsPage() {
  return <KdsBoard />;
}
