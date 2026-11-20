"use client";

import { useEffect, useMemo, useState } from "react";
import type { TvData, TvProduct } from "@/lib/tv";
import { cartaPages } from "@/lib/tv-carta";
import type { CartaPage } from "@/lib/tv-carta";

const SLIDE_MS = 10_000;
// La carta se lee más despacio.
const CARTA_MS = 15_000;
const REFRESH_MS = 60_000;
const EMOJI: Record<string, string> = { papas: "🍟", burger: "🍔" };

type Slide =
  | { kind: "qr" }
  | { kind: "featured" }
  | { kind: "special" }
  | { kind: "loyalty" }
  // Una página de la carta: cada vez que aparece muestra la siguiente (categoría por categoría).
  | { kind: "carta" }
  | { kind: "flyer"; url: string; name: string };

const money = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/+$/, "");

// Secuencia completa: lo de siempre y, cada dos pantallas, una página de la carta.
function buildSlides(data: TvData): Slide[] {
  const base = baseSlides(data);
  if (!cartaPages(data).length) return base;
  const out: Slide[] = [];
  base.forEach((slide, i) => {
    out.push(slide);
    if (i % 2 === 1) out.push({ kind: "carta" });
  });
  if (base.length < 2) out.push({ kind: "carta" });
  return out;
}

// Los flyers intercalados con las pantallas de información.
function baseSlides(data: TvData): Slide[] {
  const info: Slide[] = [{ kind: "featured" }];
  if (data.special) info.push({ kind: "special" });
  if (data.rewards.length) info.push({ kind: "loyalty" });
  info.push({ kind: "qr" });
  const flyers: Slide[] = data.flyers.map((f) => ({ kind: "flyer", url: f.url, name: f.name }));
  if (!flyers.length) return info;
  const out: Slide[] = [];
  const rounds = Math.max(flyers.length, info.length);
  for (let i = 0; i < rounds; i++) {
    if (i < flyers.length) out.push(flyers[i]);
    if (i < info.length) out.push(info[i]);
    else if (i % 2 === 1) out.push(info[i % info.length]);
  }
  return out;
}

function Logo({ width }: { width: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/madero-logo-crema.png" alt="Madero Restó" style={{ width }} />;
}

function Qr({ svg, size }: { svg: string; size: string }) {
  return (
    <div
      className="rounded-[1.2vw] bg-[#efe3cc] p-[0.8vw] shadow-2xl"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg.replace("<svg", '<svg width="100%" height="100%"') }}
    />
  );
}

function Title({ children, size = "6vw", color = "#efe3cc" }: { children: React.ReactNode; size?: string; color?: string }) {
  return (
    <div style={{ fontFamily: "MaderoAnton, Impact, sans-serif", fontSize: size, color, lineHeight: 1, textTransform: "uppercase", letterSpacing: "0.03em" }}>
      {children}
    </div>
  );
}

function Spaced({ children, size = "1.4vw", color = "#d6b480" }: { children: React.ReactNode; size?: string; color?: string }) {
  return <div style={{ fontSize: size, color, letterSpacing: "0.45em", fontWeight: 300, textTransform: "uppercase" }}>{children}</div>;
}

function Elite({ children, size = "1.8vw", color = "#efe3cc" }: { children: React.ReactNode; size?: string; color?: string }) {
  return <div style={{ fontFamily: "MaderoElite, 'Courier New', monospace", fontSize: size, color }}>{children}</div>;
}

function ProductCard({ p }: { p: TvProduct }) {
  return (
    <div className="flex flex-col justify-between rounded-[1.2vw] border border-[#d6b480]/30 bg-black/30 px-[1.6vw] py-[1.4vw]">
      <div>
        <div style={{ fontSize: "1vw", color: "#d6b480", letterSpacing: "0.3em", textTransform: "uppercase" }}>{p.category}</div>
        <Title size="2.6vw">{p.name}</Title>
      </div>
      <div style={{ fontFamily: "MaderoAnton, Impact, sans-serif", fontSize: "3.2vw", color: "#e58a3c", marginTop: "0.8vw" }}>{money(p.price)}</div>
    </div>
  );
}

function CartaView({ page, data }: { page: CartaPage; data: TvData }) {
  const half = Math.ceil(page.items.length / 2);
  const columns = [page.items.slice(0, half), page.items.slice(half)];
  return (
    <div className="flex h-full w-full flex-col px-[5vw] py-[3.6vw]">
      <div className="mb-[2vw] flex items-end justify-between">
        <div>
          <Spaced>Nuestra carta</Spaced>
          <Title size="5.6vw">{page.category}</Title>
          {page.pages > 1 && <Elite size="1.3vw" color="#d6b480">{page.page} de {page.pages}</Elite>}
        </div>
        <div className="flex items-center gap-[1.6vw]">
          <div className="flex flex-col items-center gap-[0.4vw]">
            <Qr svg={data.qrMenu} size="7vw" />
            <div style={{ fontSize: "0.9vw", color: "#d6b480", letterSpacing: "0.3em" }}>PEDÍ ONLINE</div>
          </div>
          <Logo width="12vw" />
        </div>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-x-[5vw]">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col justify-start gap-[1.1vw]">
            {col.map((it) => (
              <div key={it.name} className="flex items-baseline gap-[1vw]">
                <span style={{ fontFamily: "MaderoAnton, Impact, sans-serif", fontSize: "2.3vw", color: "#efe3cc", textTransform: "uppercase", letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "30vw" }}>
                  {it.name}
                </span>
                <span className="flex-1" style={{ borderBottom: "0.2vw dotted rgba(214,180,128,.45)", transform: "translateY(-0.5vw)" }} />
                <span style={{ fontFamily: "MaderoAnton, Impact, sans-serif", fontSize: "2.5vw", color: "#e58a3c", whiteSpace: "nowrap" }}>{money(it.price)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Flyer: los horizontales (como una tele) ocupan toda la pantalla; los verticales van al centro
// con el logo y el QR al costado.
function FlyerView({ url, name, data }: { url: string; name: string; data: TvData }) {
  const [landscape, setLandscape] = useState<boolean | null>(null);
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-3xl" />
      {landscape ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="relative h-full w-full object-contain" />
      ) : (
        <div className="relative flex h-full w-full items-center justify-center gap-[4vw] px-[4vw]" style={{ visibility: landscape === null ? "hidden" : "visible" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={name}
            onLoad={(e) => setLandscape(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight >= 1.25)}
            onError={() => setLandscape(false)}
            className="max-h-[92vh] max-w-[62vw] rounded-[1vw] object-contain shadow-2xl"
          />
          <div className="flex flex-col items-center gap-[1.2vw] text-center">
            <Logo width="14vw" />
            <Spaced size="1.1vw">Pedí online</Spaced>
            <Qr svg={data.qrMenu} size="13vw" />
            <Elite size="1.2vw" color="#d6b480">@{data.instagram}</Elite>
          </div>
        </div>
      )}
    </div>
  );
}

function SlideView({ slide, data, cartaPage }: { slide: Slide; data: TvData; cartaPage: CartaPage | null }) {
  if (slide.kind === "carta") return cartaPage ? <CartaView page={cartaPage} data={data} /> : null;
  if (slide.kind === "flyer") {
    return <FlyerView url={slide.url} name={slide.name} data={data} />;
  }
  if (slide.kind === "qr") {
    return (
      <div className="flex h-full w-full items-center justify-center gap-[6vw] px-[6vw]">
        <div className="flex max-w-[48vw] flex-col gap-[1.6vw]">
          <Logo width="20vw" />
          <Spaced>Desde tu mesa o para llevar</Spaced>
          <Title size="7.5vw">Pedí desde tu celular</Title>
          <Elite size="2vw">Escaneá el código y armá tu pedido</Elite>
          <Title size="3.2vw" color="#e58a3c">{host(data.menuUrl)}</Title>
          <Elite size="1.6vw" color="#d6b480">📸 Seguinos en Instagram @{data.instagram}</Elite>
        </div>
        <Qr svg={data.qrMenu} size="32vw" />
      </div>
    );
  }
  if (slide.kind === "featured") {
    return (
      <div className="flex h-full w-full flex-col px-[5vw] py-[4vw]">
        <div className="mb-[2.4vw] flex items-end justify-between">
          <div>
            <Spaced>{data.featuredKind === "popular" ? "Lo que más se pide" : "Hoy te recomendamos"}</Spaced>
            <Title size="5.4vw">{data.featuredKind === "popular" ? "Los favoritos de Madero" : "Para esta noche"}</Title>
          </div>
          <Logo width="13vw" />
        </div>
        <div className="grid flex-1 grid-cols-3 gap-[1.6vw]">
          {data.featured.slice(0, 6).map((p) => (
            <ProductCard key={p.name} p={p} />
          ))}
        </div>
      </div>
    );
  }
  if (slide.kind === "special" && data.special) {
    const s = data.special;
    return (
      <div className="flex h-full w-full items-center justify-center gap-[5vw] px-[6vw]">
        <div className="flex max-w-[52vw] flex-col gap-[1.4vw]">
          <Spaced size="1.6vw" color="#e58a3c">★ Especial del día ★</Spaced>
          <Title size="8vw">{s.name}</Title>
          {s.text && <Elite size="2.2vw">{s.text}</Elite>}
          <Title size="6vw" color="#e58a3c">{money(s.price)}</Title>
          <Logo width="14vw" />
        </div>
        {s.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.imageUrl} alt={s.name} className="max-h-[80vh] max-w-[36vw] rounded-[1.4vw] object-cover shadow-2xl" />
        ) : (
          <Qr svg={data.qrMenu} size="26vw" />
        )}
      </div>
    );
  }
  if (slide.kind === "loyalty") {
    return (
      <div className="flex h-full w-full items-center justify-center gap-[5vw] px-[6vw]">
        <div className="flex max-w-[50vw] flex-col gap-[1.4vw]">
          <Spaced>Madero · Club</Spaced>
          <Title size="7vw">Sumá sellos</Title>
          <Title size="5vw" color="#e58a3c">y ganá premios</Title>
          <div className="mt-[1vw] flex flex-col gap-[0.8vw]">
            {data.rewards.map((r) => (
              <Elite key={r.code} size="2.4vw">
                {EMOJI[r.code] ?? "🎁"} {r.firstMilestone} sellos: {r.name}
              </Elite>
            ))}
          </div>
          <Elite size="1.6vw" color="#d6b480">Un sello por compra · Dejá tu WhatsApp al pagar o pedí online</Elite>
        </div>
        <div className="flex flex-col items-center gap-[1.4vw]">
          <div
            className="flex w-[30vw] flex-col gap-[1.4vw] rounded-[1.6vw] p-[2vw] shadow-2xl"
            style={{ background: "linear-gradient(135deg,#a85a2a,#d97b3f 55%,#f0a868)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div style={{ fontSize: "0.9vw", letterSpacing: "0.35em", color: "rgba(255,255,255,.8)", fontWeight: 700 }}>MADERO · CLUB</div>
                <div style={{ fontFamily: "Georgia, serif", fontSize: "2.6vw", color: "#fff" }}>Tarjeta VIP</div>
              </div>
              <div style={{ fontSize: "2.4vw" }}>⭐</div>
            </div>
            <div className="flex gap-[0.6vw]">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex h-[3vw] w-[3vw] items-center justify-center rounded-full" style={{ background: i < 2 ? "#fff" : "rgba(255,255,255,.18)", color: "#a85a2a", fontSize: "1.4vw" }}>
                  {i < 2 ? "★" : ""}
                </div>
              ))}
              <div className="flex h-[3vw] w-[3vw] items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,.3)", border: "0.2vw solid #fff", fontSize: "1.5vw" }}>
                🎁
              </div>
            </div>
          </div>
          <div className="flex items-center gap-[1.2vw]">
            <Qr svg={data.qrFidelidad} size="9vw" />
            <Elite size="1.4vw" color="#d6b480">Mirá tus sellos</Elite>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

export function TvScreen() {
  const [data, setData] = useState<TvData | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/tv", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: TvData) => {
          if (alive) {
            setData(d);
            setError(false);
          }
        })
        .catch(() => alive && setError(true));
    load();
    const refresh = setInterval(load, REFRESH_MS);
    // Una vez cada 6 horas se recarga entera (así toma las versiones nuevas del sistema).
    const reload = setTimeout(() => window.location.reload(), 6 * 3600_000);
    return () => {
      alive = false;
      clearInterval(refresh);
      clearTimeout(reload);
    };
  }, []);

  const slides = useMemo(() => (data ? buildSlides(data) : []), [data]);
  const pages = useMemo(() => (data ? cartaPages(data) : []), [data]);
  // Página de la carta que se muestra: avanza cada vez que aparece una pantalla de carta.
  const [cartaIndex, setCartaIndex] = useState(0);

  const slide = slides.length ? slides[index % slides.length] : null;

  useEffect(() => {
    if (!slides.length) return;
    const t = setTimeout(() => {
      const next = (index + 1) % slides.length;
      if (slides[next]?.kind === "carta" && slide?.kind !== "carta") setCartaIndex((c) => c + 1);
      setIndex(next);
    }, slide?.kind === "carta" ? CARTA_MS : SLIDE_MS);
    return () => clearTimeout(t);
  }, [index, slides, slide?.kind]);

  const cartaPage = pages.length ? pages[(cartaIndex + pages.length - 1) % pages.length] : null;

  return (
    <main
      className="fixed inset-0 overflow-hidden"
      style={{ cursor: "none", background: "radial-gradient(ellipse at 50% 45%, #3a2416 0%, #1a110b 55%, #0d0b0a 100%)" }}
      onDoubleClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
    >
      {!data ? (
        <div className="flex h-full items-center justify-center">
          {error ? <Elite size="2vw">Conectando con MaderoSys…</Elite> : <Logo width="24vw" />}
        </div>
      ) : (
        slide && (
          <div key={`${index}-${slide.kind}-${cartaIndex}`} className="tv-fade h-full w-full">
            <SlideView slide={slide} data={data} cartaPage={cartaPage} />
          </div>
        )
      )}
      {slides.length > 1 && (
        <div className="absolute bottom-[1.2vw] left-1/2 flex -translate-x-1/2 gap-[0.5vw]">
          {slides.map((_, i) => (
            <span key={i} className="h-[0.35vw] w-[1.6vw] rounded-full" style={{ background: i === index % slides.length ? "#e58a3c" : "rgba(239,227,204,.25)" }} />
          ))}
        </div>
      )}
    </main>
  );
}
