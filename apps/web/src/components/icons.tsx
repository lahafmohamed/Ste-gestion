import type { SVGProps } from "react";

// Icônes ligne (stroke = currentColor), 24×24, inline (aucune dépendance).
function Base({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={20}
      height={20}
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export type IconProps = SVGProps<SVGSVGElement>;

export const IconDashboard = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </Base>
);

export const IconContract = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M9 9h1M9 13h6M9 17h6" />
  </Base>
);

export const IconTruck = (p: IconProps) => (
  <Base {...p}>
    <path d="M2 5h11v11H2z" />
    <path d="M13 8h4l4 4v4h-8" />
    <circle cx="7" cy="18" r="2" />
    <circle cx="17" cy="18" r="2" />
  </Base>
);

export const IconSaw = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 7l6 6" />
    <path d="M4 4l4 1-1 4-4-1z" />
    <path d="M9 13l7-7 5 5-7 7" />
    <path d="M14 18l3 3" />
  </Base>
);

export const IconBox = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
    <path d="M3 8l9 5 9-5" />
    <path d="M12 13v8" />
  </Base>
);

export const IconSales = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 12V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8" />
    <circle cx="12" cy="11" r="2.5" />
    <path d="M17 15h5M19.5 12.5v5" />
  </Base>
);

export const IconContainer = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="7" width="18" height="10" rx="1" />
    <path d="M7 7v10M12 7v10M17 7v10" />
    <path d="M3 20h18" />
  </Base>
);

export const IconReport = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M7 7H5M7 12H5M7 17H5" />
    <path d="M10 8h4M10 12h4M10 16h2" />
  </Base>
);

export const IconUsers = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M17 14.5c2.5.3 4 1.8 4 4" />
  </Base>
);

export const IconLogout = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
    <path d="M10 8l-4 4 4 4M6 12h10" />
  </Base>
);

export const IconLedger = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 3h11a1 1 0 0 1 1 1v16l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1Z" />
    <path d="M9 8h6M9 12h6" />
  </Base>
);
