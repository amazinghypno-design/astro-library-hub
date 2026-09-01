import type { IconProps } from "./icons";

/**
 * The editor toolbar's own glyphs, kept out of icons.tsx because they are a
 * closed set used in exactly one place — twenty-odd marks and block shapes
 * that mean nothing outside a document toolbar, and would otherwise double
 * the size of the app's shared icon file.
 *
 * Same drawing language as icons.tsx: 24px grid, 1.6px stroke, currentColor.
 */
const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconRedo(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M19.5 9.5H12a5.5 5.5 0 1 0 0 11h2" />
      <path d="M16 5.5 19.5 9.5 16 13.5" />
    </svg>
  );
}

export function IconBold(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z" />
      <path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z" />
    </svg>
  );
}

export function IconItalic(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M15 5h-5" />
      <path d="M14 19H9" />
      <path d="M13.5 5 10.5 19" />
    </svg>
  );
}

export function IconUnderline(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 4.5v6.5a5 5 0 0 0 10 0V4.5" />
      <path d="M5.5 20h13" />
    </svg>
  );
}

export function IconStrikethrough(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14" />
      <path d="M16.5 7.5A4 4 0 0 0 12.8 5.2C10.2 5 8 6.2 8 8.4c0 1.4 1 2.5 2.6 3.1" />
      <path d="M8 16a4 4 0 0 0 4 2.8c2.6 0 4.4-1.2 4.4-3.1 0-.7-.2-1.3-.6-1.8" />
    </svg>
  );
}

export function IconCode(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 8.5 5 12l4 3.5" />
      <path d="M15 8.5 19 12l-4 3.5" />
      <path d="M13.5 5.5 10.5 18.5" />
    </svg>
  );
}

export function IconListBullet(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="17.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconListOrdered(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <path d="M3.4 4.8 4.6 4.2v3.4" strokeWidth="1.4" />
      <path d="M3.3 10.6a1.1 1.1 0 0 1 1.9.7c0 .9-1.9 1.4-1.9 2.4h2.1" strokeWidth="1.4" />
      <path d="M3.4 15.9h1.8L4 17.3a1 1 0 1 1-.6 1.8" strokeWidth="1.4" />
    </svg>
  );
}

export function IconListTask(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M11 6.5h9M11 12h9M11 17.5h9" />
      <rect x="3" y="4.7" width="4" height="4" rx="1" />
      <path d="M3.4 12.3 4.6 13.5 7 11" />
      <rect x="3" y="15.7" width="4" height="4" rx="1" />
    </svg>
  );
}

export function IconIndent(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5.5h16M9 10.5h11M9 15.5h11M4 20.5h16" />
      <path d="m3.5 9.5 3 3-3 3" />
    </svg>
  );
}

export function IconOutdent(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5.5h16M9 10.5h11M9 15.5h11M4 20.5h16" />
      <path d="m6.5 9.5-3 3 3 3" />
    </svg>
  );
}

export function IconAlignLeft(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h16M4 10.5h10M4 15h16M4 19.5h10" />
    </svg>
  );
}

export function IconAlignCenter(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h16M7 10.5h10M4 15h16M7 19.5h10" />
    </svg>
  );
}

export function IconAlignRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h16M10 10.5h10M4 15h16M10 19.5h10" />
    </svg>
  );
}

export function IconAlignJustify(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h16M4 10.5h16M4 15h16M4 19.5h16" />
    </svg>
  );
}

export function IconQuote(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9.5 7.5C7 8.5 5.5 10.5 5.5 13v3.5h4.5V12H7.8c0-1.6.7-2.8 2.2-3.4z" />
      <path d="M18 7.5c-2.5 1-4 3-4 5.5v3.5h4.5V12h-2.2c0-1.6.7-2.8 2.2-3.4z" />
    </svg>
  );
}

export function IconCodeBlock(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M9.5 10 7.5 12l2 2" />
      <path d="M14.5 10l2 2-2 2" />
    </svg>
  );
}

export function IconHorizontalRule(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12h16" />
      <path d="M6 7h12M6 17h12" strokeOpacity="0.35" />
    </svg>
  );
}

export function IconLink(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.4 1.4" />
      <path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.4-1.4" />
    </svg>
  );
}

export function IconUnlink(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9.5 14.5 7 17a3.5 3.5 0 0 1-5-5l2.5-2.5" />
      <path d="M14.5 9.5 17 7a3.5 3.5 0 0 1 5 5l-2.5 2.5" />
      <path d="m4 4 16 16" />
    </svg>
  );
}

export function IconImage(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m4.5 17.5 4.5-4.5 3.5 3.5 3-2.5 4 3.5" />
    </svg>
  );
}

export function IconTable(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9.8h18M3 14.4h18M9.5 5v14M15 5v14" />
    </svg>
  );
}

export function IconPalette(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.6 0-1.4-1.3-1.6-1.3-2.7 0-.8.7-1.4 1.6-1.4h1.4A4.6 4.6 0 0 0 20.5 10c0-3.6-3.6-6.5-8.5-6.5Z" />
      <circle cx="7.8" cy="11.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="7.8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconTextSize(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 8V6h9v2" />
      <path d="M7.5 6v13M5.5 19h4" />
      <path d="M13.5 13v-1.3h7V13" />
      <path d="M17 11.7V19M15.3 19h3.4" />
    </svg>
  );
}

export function IconFont(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 19 10 5h1.6L18 19" />
      <path d="M6.6 14.2h8.6" />
      <path d="M20.5 19v-4.2a2.2 2.2 0 0 0-4.2-.9" />
    </svg>
  );
}

export function IconSpellCheck(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 15.5 7 5.5l4 10" />
      <path d="M4.4 12h5.2" />
      <path d="M13.5 19.5 16 22l5.5-6" />
    </svg>
  );
}

export function IconChevronsUp(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m6 15 6-6 6 6" />
      <path d="m6 20 6-6 6 6" />
    </svg>
  );
}

export function IconChevronsDown(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m6 4 6 6 6-6" />
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
