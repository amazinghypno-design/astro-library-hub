import sanitizeHtml from "sanitize-html";

/**
 * Everything the editor (client/src/components/RichTextEditor.tsx) can
 * produce, and nothing else. A note's HTML is written by the owner in their
 * own browser, but it also arrives from a paste out of Notion or Word, which
 * carries whatever markup those apps felt like emitting — including script
 * and style. So the server treats every save as untrusted and stores only
 * what survives this pass, rather than sanitizing on the way out: the stored
 * row is then safe for anything that ever reads it.
 */
const ALLOWED_TAGS = [
  "p", "br", "hr", "div", "span",
  "strong", "b", "em", "i", "u", "s", "strike", "mark", "sub", "sup",
  "h1", "h2", "h3", "h4",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "a", "img",
  "table", "thead", "tbody", "tr", "td", "th",
];

const COLOR_PATTERN = /^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})|rgba?\([\d\s.,%]+\)|[a-zA-Z]+)$/;
const FONT_FAMILY_PATTERN = /^["']?[\w\u0E00-\u0E7F][\w\u0E00-\u0E7F \-]*["']?( *, *["']?[\w\u0E00-\u0E7F][\w\u0E00-\u0E7F \-]*["']?)*$/;

export function sanitizeNoteHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      // The checkbox list and the text colours are attributes, not tags: the
      // editor stores a ticked box as data-checked on the <li> and a colour as
      // an inline style, and dropping either turns a checklist back into
      // bullets on the next load.
      li: ["data-type", "data-checked", "style"],
      ul: ["data-type", "style"],
      ol: ["style", "start", "type"],
      mark: ["data-color", "style"],
      span: ["style"],
      td: ["colspan", "rowspan", "colwidth", "style"],
      th: ["colspan", "rowspan", "colwidth", "style"],
      p: ["style"],
      h1: ["style"],
      h2: ["style"],
      h3: ["style"],
      h4: ["style"],
      pre: ["class"],
      code: ["class"],
    },
    allowedStyles: {
      "*": {
        "text-align": [/^(left|right|center|justify)$/],
        color: [COLOR_PATTERN],
        "background-color": [COLOR_PATTERN],
        // A note written in an uploaded font names that font here. Letters,
        // digits, spaces, quotes, commas and hyphens only — a font stack, not
        // an opening for arbitrary CSS.
        "font-family": [FONT_FAMILY_PATTERN],
        "font-size": [/^\d{1,3}(\.\d+)?(px|pt|em|rem)$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
    // Pasting an image out of another app inlines its bytes as a data: URI.
    // Allowed on <img> only, where it can render a picture and nothing else.
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    transformTags: {
      // A link in a private note still opens the open web; it leaves with no
      // referrer and no handle back on the tab it came from.
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  });
}

const BLOCK_BOUNDARY = /<\/(p|div|h[1-6]|li|tr|blockquote|pre)>|<br\s*\/?>|<\/t[dh]>/gi;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

/**
 * The note as prose: what search matches against and what the AI is handed as
 * context (see notes router). Block tags become line breaks rather than
 * vanishing, so a bullet list stays a list of separate lines instead of
 * collapsing into one run-on sentence that no keyword search can segment.
 */
export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(BLOCK_BOUNDARY, "\n")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(withBreaks)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** First line of real text, used to name a page the owner never titled. */
export function deriveNoteTitle(html: string, fallback = "ไม่มีชื่อ"): string {
  const firstLine = htmlToPlainText(html).split("\n").find((line) => line.trim().length > 0);
  if (!firstLine) return fallback;
  return firstLine.trim().slice(0, 120);
}
