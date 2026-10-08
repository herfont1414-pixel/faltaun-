interface BrandLogoProps {
  className?: string;
}

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
        <rect width="30" height="30" rx="9" fill="#ff5a1f" />
        <path
          d="M8 21V9L15 15.5L22 9V21"
          stroke="#0b0b0a"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[15px] font-bold leading-none tracking-tight text-white">
        Madero<span className="font-light text-slate-400">Sys</span>
      </span>
    </div>
  );
}
