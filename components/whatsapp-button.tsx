import { MessageCircle } from "lucide-react";

interface WhatsAppButtonProps {
  href: string;
  label?: string;
  className?: string;
}

export function WhatsAppButton({ href, label = "Consultar por WhatsApp", className = "" }: WhatsAppButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-ember px-5 py-2.5 text-sm font-medium text-base transition hover:bg-ember-soft ${className}`}
    >
      <MessageCircle className="h-4 w-4" strokeWidth={2} />
      {label}
    </a>
  );
}
