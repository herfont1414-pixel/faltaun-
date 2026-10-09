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
          <div className="h-full w-full bg-[radial-gradient(ellipse_at_50%_0%,rgba(217,123,63,0.22),#0d0b0a_68%)]" />
        )}
        <div className={HERO_IMAGE ? "absolute inset-0 bg-black/65" : "absolute inset-0 bg-black/20"} />
      </div>

      <div
        className={`mx-auto flex max-w-5xl flex-col items-center justify-center gap-5 px-5 pb-6 pt-8 sm:pb-8 lg:flex-row lg:items-center lg:py-12 ${
          hasContact ? "lg:justify-between" : "lg:justify-center"
        }`}
      >
        <div className={`flex flex-col items-center gap-2 text-center ${hasContact ? "lg:items-start lg:text-left" : ""}`}>
          <h1 className="sr-only">Madero Restó</h1>
          <Image
            src="/logo-dark.png"
            alt="Madero Restó"
            width={480}
            height={231}
            priority
            className="h-auto w-56 [clip-path:inset(2%_0_0_0)] sm:w-64"
          />
          <p className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-stone-300 sm:text-[11px] sm:tracking-[0.28em]">
            Burgers · Pizzas · Empanadas · Tragos
          </p>
          <p className="font-display text-2xl italic leading-tight text-ember-soft sm:text-3xl">
            Buena comida,
            <br className="sm:hidden" /> mejores momentos.
          </p>
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
