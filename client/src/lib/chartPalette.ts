/**
 * One categorical palette shared by every chart on the site.
 *
 * Six hues held to the same warm, slightly dusty register as the brand gold, so
 * the charts read as one family next to the navy/ivory page rather than as
 * borrowed default chart colors. The order below is the fixed assignment order
 * and must not be shuffled: it is what makes neighbouring slices and bars
 * separable, including for red/green colour blindness.
 *
 * Validated (dataviz six checks, light mode, white card surface): lightness
 * band PASS, chroma floor PASS, CVD separation worst adjacent pair ΔE 18.8
 * (protan), normal-vision worst adjacent pair ΔE 21.0. Gold sits at 2.55:1
 * against white, under the 3:1 mark contrast bar — allowed here only because
 * both charts direct-label every value, so nothing is ever identified by colour
 * alone. Re-run the validator before changing any hex.
 */
export const CHART_HUES = [
  "#c99b3f", // gold — the brand hue
  "#a84a34", // clay
  "#5c63ae", // indigo
  "#7c9438", // olive
  "#7a3a63", // plum
  "#3aa898", // teal
] as const;

/**
 * A warm grey for "อื่นๆ", the catch-all bucket. It is not a kind of document,
 * it is the absence of one, so it does not spend a hue — which is also what
 * leaves all six for the named types now that "program" is one of them. Not
 * part of the validated categorical set: it is deliberately the lowest-chroma
 * thing on the chart, and is never adjacent to itself.
 */
const NEUTRAL_HUE = "#8d8578";

/**
 * Document types get a permanent hue each, keyed by type rather than by
 * position, so a type keeps its colour when another type appears, disappears,
 * or overtakes it in the ranking.
 */
export const FILE_TYPE_HUES: Record<string, string> = {
  ebook: CHART_HUES[0],
  document: CHART_HUES[1],
  spreadsheet: CHART_HUES[2],
  program: CHART_HUES[5],
  slide: CHART_HUES[3],
  poster: CHART_HUES[4],
  other: NEUTRAL_HUE,
};

/** Small stable string hash — same category id always lands on the same hue. */
function hashCode(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Hues for a list of categories, in render order. The starting slot comes from
 * the category id, not from its rank, so a category keeps its colour when the
 * counts reshuffle the chart; a hue already taken by another bar steps on to
 * the next free one, so up to six bars are all different colours and no two
 * read as an accidental pair.
 */
export function categoryHues(ids: string[]): string[] {
  const taken = new Set<number>();
  const hues: string[] = [];
  ids.forEach((id, i) => {
    let slot = hashCode(id) % CHART_HUES.length;
    // Past the sixth category the palette is spent and hues start repeating —
    // fine on a chart where every bar is named, as long as the repeat is not
    // the bar directly above.
    const clash = (s: number) => (taken.size < CHART_HUES.length ? taken.has(s) : CHART_HUES[s] === hues[i - 1]);
    for (let step = 0; step < CHART_HUES.length && clash(slot); step++) {
      slot = (slot + 1) % CHART_HUES.length;
    }
    taken.add(slot);
    hues.push(CHART_HUES[slot]);
  });
  return hues;
}

/** A slightly lighter tint of the same hue, for the far end of a bar fill. */
export function tint(hue: string) {
  return `color-mix(in oklab, ${hue}, white 22%)`;
}
