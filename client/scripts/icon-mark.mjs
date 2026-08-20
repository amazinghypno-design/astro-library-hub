// Single source for the manuscript mark: quadratic Bezier outlines, sampled to
// polygons for the PNG rasteriser and emitted verbatim as SVG path data.
export const NAVY = [10, 15, 31];
export const GOLD = [212, 169, 74];
export const GOLD_DEEP = [163, 124, 51];

const q = (p0, c, p1) => ({ p0, c, p1 });
const sample = (edges, n = 24) => {
  const pts = [];
  for (const e of edges) {
    for (let i = 0; i < n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([
        u * u * e.p0[0] + 2 * u * t * e.c[0] + t * t * e.p1[0],
        u * u * e.p0[1] + 2 * u * t * e.c[1] + t * t * e.p1[1],
      ]);
    }
  }
  return pts;
};
const d = (edges) =>
  `M${edges[0].p0.map(round).join(" ")}` +
  edges.map((e) => `Q${round(e.c[0])} ${round(e.c[1])} ${round(e.p1[0])} ${round(e.p1[1])}`).join("") + "Z";
const round = (n) => Math.round(n * 10) / 10;
const mirror = (edges) =>
  [...edges].reverse().map((e) => q([100 - e.p1[0], e.p1[1]], [100 - e.c[0], e.c[1]], [100 - e.p0[0], e.p0[1]]));

// One leaf of an open manuscript: sags along the top, bows out at the fore
// edge, and meets the fold on the right.
const leaf = [
  q([7, 41], [28, 36], [48, 46]),      // top edge, outer -> fold
  q([48, 46], [48, 62], [48, 77]),     // the fold
  q([48, 77], [28, 73], [7, 69]),      // bottom edge, fold -> outer
  q([7, 69], [4.5, 55], [7, 41]),      // fore edge
];
// The block of older pages showing under the leaf.
const stack = [
  q([7, 66], [28, 70], [48, 74]),
  q([48, 74], [48, 79], [48, 83]),
  q([48, 83], [28, 79], [7, 75]),
  q([7, 75], [6, 70], [7, 66]),
];
// Ruled lines, following the leaf's slope from fore edge to fold.
const rule = (t, x1 = 42, thick = 3) => {
  const x0 = 13;
  const y0 = 45 + t * 22, y1 = 50.5 + t * 22;
  return [
    q([x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2 - 1.6], [x1, y1]),
    q([x1, y1], [x1, y1 + thick / 2], [x1, y1 + thick]),
    q([x1, y1 + thick], [(x0 + x1) / 2, (y0 + y1) / 2 - 1.6 + thick], [x0, y0 + thick]),
    q([x0, y0 + thick], [x0, y0 + thick / 2], [x0, y0]),
  ];
};
// The last line stops short, the way a written page ends mid-sentence.
const rules = [rule(0.05), rule(0.42), rule(0.79, 33)];

export const SHAPES = [
  { fill: GOLD_DEEP, edges: stack },
  { fill: GOLD_DEEP, edges: mirror(stack) },
  { fill: GOLD, edges: leaf },
  { fill: GOLD, edges: mirror(leaf) },
  ...rules.flatMap((r) => [{ fill: NAVY, edges: r }, { fill: NAVY, edges: mirror(r) }]),
];
export const polygons = () => SHAPES.map((s) => ({ fill: s.fill, pts: sample(s.edges) }));
export const svgPaths = () => SHAPES.map((s) => ({ fill: s.fill, d: d(s.edges) }));

// Bounds of the drawing, for centring it inside an icon.
export const BOX = { x: 4, y: 35, w: 92, h: 49 };
