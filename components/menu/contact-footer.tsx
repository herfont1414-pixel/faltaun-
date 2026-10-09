import { Instagram, MessageCircle } from "lucide-react";

// Datos oficiales de contacto del local. Son independientes del WhatsApp de los pedidos
// (Configuración): estos enlaces solo abren el perfil o una conversación, sin tocar el carrito.
const INSTAGRAM_HANDLE = "@madero_resto";
const INSTAGRAM_URL = "https://www.instagram.com/madero_resto/";
const WHATSAPP_LABEL = "+54 3755 589363";
const WHATSAPP_URL = "https://wa.me/543755589363";

// lucide no trae el logo de WhatsApp: globo con tubo de teléfono, en el mismo trazo lineal.
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      <g transform="translate(6.2 5.7) scale(0.5)" strokeWidth={3.2}>
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </g>
    </svg>
  );
}

interface ContactCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string;
  action: string;
  primary?: boolean;
}

function ContactCard({ icon, label, value, href, action, primary = false }: ContactCardProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-gradient-to-b from-base-card to-base px-2.5 py-4 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-ember/30 bg-ember/10 text-ember">
        {icon}
      </span>
      <span className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">{label}</span>
      <span className="mt-0.5 text-[15px] font-semibold text-stone-50">{value}</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-3 flex h-10 w-full items-center justify-center whitespace-nowrap rounded-full px-1 text-[12px] font-semibold transition max-[340px]:text-[10.5px] active:scale-[0.98] ${
          primary
            ? "bg-ember text-[#0d0b0a] hover:bg-ember-soft"
            : "border border-ember/50 text-ember-soft hover:bg-ember/10"
        }`}
      >
        {action}
      </a>
    </div>
  );
}

// Contacto y pie de la página pública: va al final, después del menú y de las reservas.
export function ContactFooter() {
  return (
    <footer id="contacto" className="mx-auto max-w-3xl px-5 pb-4 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <ContactCard
          icon={<Instagram className="h-5 w-5" strokeWidth={1.6} />}
          label="Instagram"
          value={INSTAGRAM_HANDLE}
          href={INSTAGRAM_URL}
          action="Seguir en Instagram"
        />
        <ContactCard
          icon={<WhatsAppIcon className="h-5 w-5" />}
          label="WhatsApp"
          value={WHATSAPP_LABEL}
          href={WHATSAPP_URL}
          action="Hablar por WhatsApp"
          primary
        />
      </div>
      <div className="mt-6 border-t border-white/10 pt-5 text-center">
        <p className="font-display text-lg text-stone-100">Madero Restó</p>
        <p className="mt-0.5 font-display text-sm italic text-ember-soft">Buena comida, mejores momentos</p>
      </div>
    </footer>
  );
}
