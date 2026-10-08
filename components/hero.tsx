import Image from "next/image";
import { MapPin, Phone, Instagram, Facebook } from "lucide-react";

const ADDRESS = process.env.NEXT_PUBLIC_RESTAURANT_ADDRESS;
const PHONE = process.env.NEXT_PUBLIC_RESTAURANT_PHONE;
const INSTAGRAM = process.env.NEXT_PUBLIC_INSTAGRAM_URL;
const FACEBOOK = process.env.NEXT_PUBLIC_FACEBOOK_URL;
const HERO_IMAGE = process.env.NEXT_PUBLIC_HERO_IMAGE_URL;

export function Hero() {
  const hasContact = ADDRESS || PHONE || INSTAGRAM || FACEBOOK;

  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10">
        {HERO_IMAGE ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL externa configurable por env, sin dominio fijo para next/image
          <img src={HERO_IMAGE} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(circle_at_30%_20%,#a85a2a,#0d0b0a_70%)]" />
        )}
        <div className="absolute inset-0 bg-black/55" />
      </div>

      <div className="mx-auto flex min-h-[260px] max-w-5xl flex-col items-center justify-center gap-5 px-5 py-14 sm:min-h-[300px] lg:flex-row lg:items-center lg:justify-between lg:py-20">
        <div className="flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
          <div className="h-20 w-20 overflow-hidden rounded-full ring-2 ring-white/70 shadow-lg sm:h-24 sm:w-24">
            <Image
              src="/logo-dark.png"
              alt="Madero Restó"
              width={240}
              height={240}
              priority
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-ember-soft">Bar &amp; Restó</p>
            <h1 className="mt-1 font-display text-3xl text-white sm:text-4xl">Madero Restó</h1>
            <p className="mx-auto mt-2 max-w-xs text-sm text-stone-200 lg:mx-0">
              Cocina de autor, tragos de barra y una carta de vinos pensada para compartir.
            </p>
          </div>
        </div>

        {hasContact && (
          <div className="hidden flex-col items-end gap-2.5 text-sm text-stone-100 lg:flex">
            {ADDRESS && (
              <div className="flex items-center gap-2">
                <span>{ADDRESS}</span>
                <MapPin className="h-4 w-4 text-ember-soft" />
              </div>
            )}
            {PHONE && (
              <a href={`tel:${PHONE}`} className="flex items-center gap-2 transition hover:text-ember-soft">
                <span>{PHONE}</span>
                <Phone className="h-4 w-4 text-ember-soft" />
              </a>
            )}
            {(INSTAGRAM || FACEBOOK) && (
              <div className="mt-1 flex items-center gap-3">
                {INSTAGRAM && (
                  <a href={INSTAGRAM} target="_blank" rel="noreferrer" aria-label="Instagram">
                    <Instagram className="h-5 w-5 text-stone-200 transition hover:text-ember-soft" />
                  </a>
                )}
                {FACEBOOK && (
                  <a href={FACEBOOK} target="_blank" rel="noreferrer" aria-label="Facebook">
                    <Facebook className="h-5 w-5 text-stone-200 transition hover:text-ember-soft" />
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
