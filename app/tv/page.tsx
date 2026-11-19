import type { Metadata } from "next";
import { TvScreen } from "@/components/tv/tv-screen";

export const metadata: Metadata = { title: "Madero TV" };
export const dynamic = "force-dynamic";

// Pantalla para la tele del local. Se abre en la PC (y se transmite a la tele) o desde un
// navegador en la tele: http://IP-DE-LA-PC:3000/tv
export default function TvPage() {
  return <TvScreen />;
}
