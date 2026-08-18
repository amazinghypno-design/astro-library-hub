/**
 * Custom "find in page" over an already-rendered container — no native
 * window.find() (inconsistent across browsers, can't report a match count
 * or jump programmatically). Wraps each match in a <mark> and returns them
 * in document order so the caller can step through with next/prev.
 */
export function highlightMatches(container: HTMLElement, query: string): HTMLElement[] {
  clearHighlights(container);
  const trimmed = query.trim();
  if (!trimmed) return [];

  const needle = trimmed.toLowerCase();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  const marks: HTMLElement[] = [];
  for (const textNode of textNodes) {
    const text = textNode.textContent ?? "";
    const lower = text.toLowerCase();
    let searchFrom = 0;
    let matchIndex = lower.indexOf(needle, searchFrom);
    if (matchIndex === -1) continue;

    const parent = textNode.parentNode;
    if (!parent) continue;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    while (matchIndex !== -1) {
      fragment.appendChild(document.createTextNode(text.slice(cursor, matchIndex)));
      const mark = document.createElement("mark");
      mark.className = "preview-search-match bg-gold-400/60 rounded-sm";
      mark.textContent = text.slice(matchIndex, matchIndex + needle.length);
      fragment.appendChild(mark);
      marks.push(mark);
      cursor = matchIndex + needle.length;
      searchFrom = cursor;
      matchIndex = lower.indexOf(needle, searchFrom);
    }
    fragment.appendChild(document.createTextNode(text.slice(cursor)));
    parent.replaceChild(fragment, textNode);
  }

  return marks;
}

export function clearHighlights(container: HTMLElement): void {
  const marks = container.querySelectorAll("mark.preview-search-match");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
    parent.normalize();
  });
}

export function focusMatch(marks: HTMLElement[], index: number): void {
  marks.forEach((m) => m.classList.remove("preview-search-current", "bg-gold-500"));
  const target = marks[index];
  if (!target) return;
  target.classList.add("preview-search-current", "bg-gold-500");
  target.scrollIntoView({ behavior: "smooth", block: "center" });
}
