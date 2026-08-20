import type { SVGProps } from "react";

/**
 * The site's mark: an open manuscript. It lives outside icons.tsx
 * on purpose — those are 1.6px stroke UI glyphs on a 24 grid, this is a filled
 * brand mark on a 100 grid, and the two languages should not be averaged.
 *
 * The same outlines are rasterised into the home-screen icons in public/, so
 * the tab, the header and the installed app all show one drawing. The ruled
 * lines are painted navy-950 rather than knocked out, so the mark keeps its
 * writing on a light background as well as on the navy bar.
 */
export default function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    // The viewBox is cropped to the drawing rather than the 100 box the shapes
    // are authored in, so the mark fills the small space it gets in the header;
    // the home-screen icons add their own padding instead.
    <svg viewBox="4 35 92 49" width={30} height={16} fill="none" aria-hidden {...props}>
      {/* the block of older pages showing under each leaf */}
      <g fill="currentColor" opacity="0.62">
        <path d="M7 66Q28 70 48 74Q48 79 48 83Q28 79 7 75Q6 70 7 66Z" />
        <path d="M93 66Q94 70 93 75Q72 79 52 83Q52 79 52 74Q72 70 93 66Z" />
      </g>
      {/* the two open leaves */}
      <g fill="currentColor">
        <path d="M7 41Q28 36 48 46Q48 62 48 77Q28 73 7 69Q4.5 55 7 41Z" />
        <path d="M93 41Q95.5 55 93 69Q72 73 52 77Q52 62 52 46Q72 36 93 41Z" />
      </g>
      {/* ruled writing, the last line stopping short the way a page ends */}
      <g fill="#0a0f1f">
        <path d="M13 46.1Q27.5 47.3 42 51.6Q42 53.1 42 54.6Q27.5 50.3 13 49.1Q13 47.6 13 46.1Z" />
        <path d="M87 46.1Q87 47.6 87 49.1Q72.5 50.3 58 54.6Q58 53.1 58 51.6Q72.5 47.3 87 46.1Z" />
        <path d="M13 54.2Q27.5 55.4 42 59.7Q42 61.2 42 62.7Q27.5 58.4 13 57.2Q13 55.7 13 54.2Z" />
        <path d="M87 54.2Q87 55.7 87 57.2Q72.5 58.4 58 62.7Q58 61.2 58 59.7Q72.5 55.4 87 54.2Z" />
        <path d="M13 62.4Q23 63.5 33 67.9Q33 69.4 33 70.9Q23 66.5 13 65.4Q13 63.9 13 62.4Z" />
        <path d="M87 62.4Q87 63.9 87 65.4Q77 66.5 67 70.9Q67 69.4 67 67.9Q77 63.5 87 62.4Z" />
      </g>
    </svg>
  );
}
