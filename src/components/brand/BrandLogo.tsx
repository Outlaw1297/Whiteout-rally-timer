import { BrandMark } from "./BrandMark";

type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  className?: string;
  markClassName?: string;
};

const sizeMap = {
  sm: { mark: "h-7 w-7", whiteout: "text-sm", sub: "text-[9px]" },
  md: { mark: "h-9 w-9", whiteout: "text-base", sub: "text-[10px]" },
  lg: { mark: "h-12 w-12", whiteout: "text-xl sm:text-2xl", sub: "text-[11px] sm:text-xs" },
} as const;

/** Full brand lockup: mark + WHITEOUT / RALLY TIMER. */
export function BrandLogo({
  size = "md",
  showWordmark = true,
  className = "",
  markClassName,
}: BrandLogoProps) {
  const s = sizeMap[size];
  return (
    <div className={`inline-flex items-center gap-2.5 min-w-0 ${className}`}>
      <BrandMark className={markClassName || s.mark} />
      {showWordmark && (
        <div className="min-w-0 leading-none">
          <p
            className={`font-semibold tracking-[0.14em] text-rally-snow uppercase ${s.whiteout}`}
          >
            Whiteout
          </p>
          <p
            className={`mt-1 font-medium tracking-[0.22em] text-rally-ice uppercase ${s.sub}`}
          >
            Rally Timer
          </p>
        </div>
      )}
    </div>
  );
}
