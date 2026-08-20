/**
 * Rasterises a slice of live DOM to a canvas, with no external dependency.
 *
 * The PDF reader can capture a page because PDF.js already painted it to a
 * canvas. Word and Excel previews are ordinary HTML, so there is nothing to
 * read pixels from — the browser will only rasterise HTML for us through one
 * documented route: an <svg><foreignObject> containing XHTML, loaded as an
 * image. That imposes the rules this module works within:
 *
 * - The markup must be well-formed XHTML, hence XMLSerializer on a clone.
 * - Nothing inherits from the page's stylesheets, so every computed style has
 *   to be written onto the clone inline before serialising.
 * - Any subresource must be same-origin or a data: URI. The previews qualify:
 *   mammoth inlines docx images as data: URIs, and spreadsheets are pure
 *   markup. An external image would taint the canvas and toBlob would throw,
 *   which is why capture reports failure rather than saving a broken file.
 */

/** Styles worth copying. Copying all ~340 computed properties is both slow and lossy (many are invalid to re-parse). */
const COPIED_PROPERTIES = [
  "font", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing",
  "color", "background-color", "text-align", "text-decoration", "text-indent", "white-space", "vertical-align",
  "margin", "padding", "border", "border-collapse", "border-spacing", "border-radius",
  "display", "width", "height", "max-width", "min-width", "box-sizing", "overflow-wrap", "word-break",
  "list-style-type", "list-style-position",
];

function inlineComputedStyles(source: Element, clone: Element): void {
  const sourceNodes = [source, ...Array.from(source.querySelectorAll("*"))];
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll("*"))];

  for (let i = 0; i < sourceNodes.length; i += 1) {
    const target = cloneNodes[i] as HTMLElement | undefined;
    if (!target) break;
    const computed = window.getComputedStyle(sourceNodes[i]);
    let css = "";
    for (const property of COPIED_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (value) css += `${property}:${value};`;
    }
    target.setAttribute("style", css);
  }
}

export interface CaptureRegion {
  /** CSS pixels of `source`'s own coordinate space. */
  width: number;
  height: number;
  /** How far down `source` the captured slice starts. */
  offsetY: number;
  background: string;
  /** Output pixels per CSS pixel — 2 keeps text crisp on HiDPI screens. */
  pixelRatio: number;
}

export async function renderElementRegionToCanvas(source: HTMLElement, region: CaptureRegion): Promise<HTMLCanvasElement> {
  const clone = source.cloneNode(true) as HTMLElement;
  inlineComputedStyles(source, clone);
  // Only the vertical offset is imposed, so `offsetY` of the original lines up
  // with the top edge of the output. The clone's own width and box-sizing are
  // left exactly as inlined from the live element: forcing a width here made
  // the content box wider than the original by the amount of its padding, and
  // every line ran off the right edge of the capture.
  clone.style.transform = `translateY(${-region.offsetY}px)`;

  const wrapper = document.createElement("div");
  wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrapper.style.width = `${region.width}px`;
  wrapper.style.height = `${region.height}px`;
  wrapper.style.overflow = "hidden";
  wrapper.style.background = region.background;
  wrapper.appendChild(clone);

  const serialized = new XMLSerializer().serializeToString(wrapper);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${region.width}" height="${region.height}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">${serialized}</foreignObject></svg>`;

  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(region.width * region.pixelRatio);
  canvas.height = Math.round(region.height * region.pixelRatio);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("CANVAS_CONTEXT_UNAVAILABLE");
  context.fillStyle = region.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}
