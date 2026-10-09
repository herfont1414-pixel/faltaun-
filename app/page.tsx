import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { CartProvider } from "@/components/menu/cart-context";
import { DeliveryToggleCard } from "@/components/menu/delivery-toggle-card";
import { LoyaltyBanner } from "@/components/menu/loyalty-banner";
import { MenuExperience } from "@/components/menu/menu-experience";
import { ReservationForm } from "@/components/reservations/reservation-form";
import { getMenuHighlights, getMenuItems } from "@/lib/menu";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const items = await getMenuItems();
  const highlights = await getMenuHighlights(items);

  return (
    <CartProvider>
      <main className="pb-28 lg:pb-10">
        <Header />
        <Hero />
        <DeliveryToggleCard />
        <LoyaltyBanner />
        <div className="mt-2">
          <MenuExperience items={items} highlights={highlights} />
        </div>
        <div className="mx-auto max-w-3xl">
          <ReservationForm />
        </div>
      </main>
    </CartProvider>
  );
}
