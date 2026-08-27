import Image from "next/image";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-base/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
        <Image
          src="/logo-dark.png"
          alt="Madero Restó"
          width={480}
          height={231}
          priority
          className="h-11 w-auto"
        />
        <a
          href="#reservas"
          className="rounded-full border border-ember/40 px-4 py-1.5 text-sm text-ember-soft transition hover:bg-ember/10"
        >
          Reservar
        </a>
      </div>
    </header>
  );
}
