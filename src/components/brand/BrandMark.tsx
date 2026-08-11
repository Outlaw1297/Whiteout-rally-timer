/** Mountain + timer + snowflake mark for Whiteout Rally Timer. */
export function BrandMark({
  className = "h-8 w-8",
  title = "Whiteout Rally Timer",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <rect width="64" height="64" rx="14" className="fill-rally-bg" />
      <circle cx="32" cy="27" r="14.5" className="stroke-rally-ice" strokeWidth="2.75" />
      <path
        d="M32 12.5v4.5"
        className="stroke-rally-ice"
        strokeWidth="2.75"
        strokeLinecap="round"
      />
      <circle
        cx="32"
        cy="27"
        r="10.5"
        className="stroke-rally-snow"
        strokeWidth="1.75"
        strokeDasharray="30 5"
        strokeDashoffset="-2.5"
      />
      <g className="stroke-rally-ice" strokeWidth="1.4" strokeLinecap="round">
        <path d="M32 20.5v13M25.5 27h13" />
        <path d="M27.2 22.2l9.6 9.6M36.8 22.2l-9.6 9.6" />
        <circle cx="32" cy="27" r="1.4" className="fill-rally-ice stroke-none" />
      </g>
      <path
        d="M12 50 L22 37.5 L29.5 45 L37.5 31 L52 50 Z"
        className="stroke-rally-snow"
        strokeWidth="2.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}
