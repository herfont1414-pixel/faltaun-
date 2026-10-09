import type { ComponentType } from "react";

// Iconos lineales propios para tres categorías. Mismo estilo que los de lucide-react
// (24x24, trazo redondeado, color y grosor heredados: se usan igual que ellos).
interface IconProps {
  className?: string;
  strokeWidth?: number;
}

function Svg({ className, strokeWidth = 2, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// Papas fritas dentro de un recipiente.
export function FriesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7.5 10.5V6" />
      <path d="M10 10.5V3.5" />
      <path d="M12.5 10.5V4.5" />
      <path d="M15 10.5V3.5" />
      <path d="M17.5 10.5V6" />
      <path d="M4.5 10.5h15" />
      <path d="m5.7 10.5 1.2 8.6a1.6 1.6 0 0 0 1.6 1.4h7a1.6 1.6 0 0 0 1.6-1.4l1.2-8.6" />
    </Svg>
  );
}

// Una empanada: media luna con repulgue en el borde curvo.
export function EmpanadaIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <g transform="translate(-0.5 1.2) rotate(-28 12 13) translate(12 13) scale(1.14) translate(-12 -13)">
        <path d="M3 17.5a9 9 0 0 1 18 0z" />
        <path d="M5.9 17.5a6.1 6.1 0 0 1 12.2 0" strokeDasharray="1.4 2" />
      </g>
    </Svg>
  );
}

// Un plato con tenedor y cuchillo.
export function PlateIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M2.5 4v4.2a1.6 1.6 0 0 0 3 0V4" />
      <path d="M4 4v16" />
      <path d="M21 4c-1.9 1.3-2.8 3.6-2.8 6.5H21" />
      <path d="M21 4v16" />
    </Svg>
  );
}

const CUSTOM_ICONS: { keywords: string[]; Icon: ComponentType<IconProps> }[] = [
  { keywords: ["entrada", "picada"], Icon: FriesIcon },
  { keywords: ["empanada"], Icon: EmpanadaIcon },
  { keywords: ["al plato", "plato"], Icon: PlateIcon },
];

// Icono propio de la categoría, o null si usa el de siempre.
export function customCategoryIcon(category: string): ComponentType<IconProps> | null {
  const normalized = category.toLowerCase();
  return CUSTOM_ICONS.find((entry) => entry.keywords.some((kw) => normalized.includes(kw)))?.Icon ?? null;
}
