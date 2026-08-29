import type { SVGProps } from "react";

/**
 * One consistent icon language for the whole app: 1.5px stroke, 24px grid,
 * rounded joins. Keeping these inline (no icon-font/CDN) keeps the CSP-free,
 * self-contained bundle simple and lets each icon inherit currentColor.
 */
export type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconHome(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 9.5V19a1 1 0 0 0 1 1H9.5a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </svg>
  );
}

export function IconLibrary(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5.5c0-.6.4-1 1-1h3.2c.4 0 .8.2 1 .6l.3.5" />
      <path d="M4 5.5v13.2c0 .5.4 1 1 1h14a1 1 0 0 0 1-1V7.5a1 1 0 0 0-1-1H10" />
      <path d="M4 8.5h16" />
    </svg>
  );
}

export function IconCategory(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function IconEbook(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 6.2c-1.3-1-3.4-1.7-5.7-1.7-.7 0-1.3.6-1.3 1.3v11.8c0 .8.6 1.3 1.3 1.3 2.3 0 4.4.7 5.7 1.7 1.3-1 3.4-1.7 5.7-1.7.7 0 1.3-.5 1.3-1.3V5.8c0-.7-.6-1.3-1.3-1.3-2.3 0-4.4.7-5.7 1.7Z" />
      <path d="M12 6.2v13.4" />
    </svg>
  );
}

export function IconDocument(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 3.5h7.5L18.5 8v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15.5a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8h4.5" />
      <path d="M9 12.5h6M9 15.5h6M9 18h3.5" />
    </svg>
  );
}

export function IconSpreadsheet(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="4.5" width="16" height="15" rx="1.5" />
      <path d="M4 9.5h16M9.5 9.5V19.5" />
      <path d="M4 14.5h16" />
    </svg>
  );
}

export function IconUpload(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 15.5V4.5" />
      <path d="M7.5 9 12 4.5 16.5 9" />
      <path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4.5v11" />
      <path d="M7.5 11 12 15.5 16.5 11" />
      <path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function IconExpand(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 4.5H4.5V9" />
      <path d="M15 4.5h4.5V9" />
      <path d="M4.5 15v4.5H9" />
      <path d="M19.5 15v4.5H15" />
    </svg>
  );
}

export function IconCollapse(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 9H9V4.5" />
      <path d="M19.5 9H15V4.5" />
      <path d="M9 19.5V15H4.5" />
      <path d="M15 19.5V15h4.5" />
    </svg>
  );
}

/** A phone turning on its side — the rotate-your-device prompt. */
export function IconRotateDevice(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M10.5 19h3" />
      <path d="M3 12a9 9 0 0 1 2.2-5.9" />
      <path d="M2.5 9.4 3 12.2l2.8-.6" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 7h14" />
      <path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2" />
      <path d="M7 7l1 12.2a1.5 1.5 0 0 0 1.5 1.3h5a1.5 1.5 0 0 0 1.5-1.3L17 7" />
      <path d="M10.3 11v6M13.7 11v6" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="1.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IconStar(props: IconProps) {
  return (
    <svg {...base} {...props} strokeWidth={1.3}>
      <path d="M12 3.5l2.2 5.1 5.5.5-4.2 3.7 1.3 5.4L12 15.6l-4.8 2.6 1.3-5.4-4.2-3.7 5.5-.5L12 3.5Z" />
    </svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M15 5.5 8 12l7 6.5" />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 5.5 16 12l-7 6.5" />
    </svg>
  );
}

export function IconBookmark(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6.5 4.5h11a1 1 0 0 1 1 1V20l-6.5-4-6.5 4V5.5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14.5 5.5 18.5 9.5 8 20H4v-4L14.5 5.5Z" />
      <path d="M13 7 17 11" />
    </svg>
  );
}

export function IconSlide(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="5.5" width="19" height="12" rx="1.5" />
      <path d="M8 20h8" />
      <path d="M6 9.5l3 3 2.5-2.5L18 13.5" />
    </svg>
  );
}

export function IconPoster(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="5.5" y="3.5" width="13" height="17" rx="1.5" />
      <path d="M12 7.5l1.1 2.3 2.5.3-1.8 1.7.4 2.5-2.2-1.2-2.2 1.2.4-2.5-1.8-1.7 2.5-.3 1.1-2.3Z" />
      <path d="M9 18h6" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconHighlighter(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9.5 15.5 5 20H3.5v-1.5L8 14" />
      <path d="M11 12.5 16.5 7a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L14.5 15Z" />
      <path d="M13 5.5 18.5 11" />
    </svg>
  );
}

export function IconCamera(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 8.5a1.5 1.5 0 0 1 1.5-1.5h2l1.2-1.8a1.5 1.5 0 0 1 1.25-.7h5.1a1.5 1.5 0 0 1 1.25.7L17 7h2a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function IconPen(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20l.9-3.8L15.5 5.6a1.8 1.8 0 0 1 2.5 0l.4.4a1.8 1.8 0 0 1 0 2.5L8 19.1 4 20Z" />
      <path d="M14 7 17 10" />
    </svg>
  );
}

export function IconUndo(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 9.5H12a5.5 5.5 0 1 1 0 11h-2" />
      <path d="M8 5.5 4.5 9.5 8 13.5" />
    </svg>
  );
}

export function IconFolderOpen(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 8V6a1.5 1.5 0 0 1 1.5-1.5h4l1.5 2H19a1.5 1.5 0 0 1 1.5 1.5v1" />
      <path d="M3.5 8h17l-1.8 9.6a1.5 1.5 0 0 1-1.5 1.2H6.8a1.5 1.5 0 0 1-1.5-1.2L3.5 8Z" />
    </svg>
  );
}

export function IconRuler(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.2 14.1 14.1 3.2a1.2 1.2 0 0 1 1.7 0l5 5a1.2 1.2 0 0 1 0 1.7L9.9 20.8a1.2 1.2 0 0 1-1.7 0l-5-5a1.2 1.2 0 0 1 0-1.7Z" />
      <path d="M7.6 9.7 9.7 11.8M10.7 6.6l2.1 2.1M13.8 3.5l2.1 2.1M4.5 12.8l2.1 2.1" />
    </svg>
  );
}

export function IconEraser(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14.4 4.3 3.9 14.8a1.8 1.8 0 0 0 0 2.5l2.3 2.3a1.8 1.8 0 0 0 1.3.5h4a1.8 1.8 0 0 0 1.3-.5l7.3-7.3a1.8 1.8 0 0 0 0-2.5l-3.2-3.2a1.8 1.8 0 0 0-2.5 0Z" />
      <path d="M9.2 9.5 15 15.3M8.5 20.1H20" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 9.5 12 15.5l6-6" />
    </svg>
  );
}

export function IconChevronUp(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 14.5 12 8.5l6 6" />
    </svg>
  );
}

export function IconChartPie(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12V3.5Z" />
      <path d="M15.5 2.6A8.5 8.5 0 0 1 21.4 8.5H15.5V2.6Z" />
    </svg>
  );
}

/** The two ways a collection can be shown — a shelf of covers, or a dense list. See components/FileCollection.tsx. */
export function IconGridCover(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="7" height="8.5" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="8.5" rx="1" />
      <rect x="3.5" y="15" width="7" height="5.5" rx="1" />
      <rect x="13.5" y="15" width="7" height="5.5" rx="1" />
    </svg>
  );
}

export function IconListRows(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    </svg>
  );
}

/** Speaking into the search box — see lib/useVoiceSearch.ts. */
export function IconMic(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

/** The mic with a stroke through it: recording, press to stop. */
export function IconMicOff(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

export function IconSave(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 4.5h11L19.5 8v11a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V6A1.5 1.5 0 0 1 6 4.5Z" />
      <path d="M8 4.5v5h7v-5" />
      <path d="M8 20.5v-6h8v6" />
    </svg>
  );
}

export function IconFontFile(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 19 10 5h1.6L18 19" />
      <path d="M6.6 14.2h8.6" />
      <path d="M20.5 19v-4.2a2.2 2.2 0 0 0-4.2-.9" />
    </svg>
  );
}
