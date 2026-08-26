import { Header } from "@/components/header";
import { MenuExperience } from "@/components/menu/menu-experience";
import { ReservationForm } from "@/components/reservations/reservation-form";
import { getMenuItems } from "@/lib/menu";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const items = await getMenuItems();

  return (
    <main className="mx-auto max-w-3xl">
      <Header />

      <section className="px-5 py-10 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-ember-soft">Bar & Restó</p>
        <h1 className="mt-2 font-display text-4xl text-stone-50">Madero Restó</h1>
        <p className="mx-auto mt-3 max-w-xs text-sm text-stone-400">
          Cocina de autor, tragos de barra y una carta de vinos pensada para compartir.
        </p>
      </section>

      <MenuExperience items={items} />
      <ReservationForm />
    </main>
  );
}
