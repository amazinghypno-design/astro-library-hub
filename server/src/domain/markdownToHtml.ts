/**
 * Markdown → the editor's own HTML, for bringing existing writing in.
 *
 * The case this exists for is a Notion export: "Export → Markdown & CSV" is
 * the only way out of Notion that needs neither their API nor a token, and it
 * produces exactly this dialect — ATX headings, `- [ ]` checkboxes, pipe
 * tables, fenced code, indented sub-lists. Pasting a Notion page straight
 * into the editor also works (the browser hands over real HTML on a paste),
 * so this covers the other half: pages already exported to disk, and whole
 * workspaces brought over one file at a time.
 *
 * Deliberately not a general CommonMark implementation — no reference links,
 * no setext headings, no raw-HTML passthrough (HTML in the source is escaped,
 * never trusted). Anything it does not recognise survives as plain text in a
 * paragraph, which is the failure mode that loses nothing.
 */

const CODE_OPEN = "⁣CODE";
const CODE_CLOSE = "⁣";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Only http/https/mailto and relative paths survive; javascript: and data: become inert text. */
function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (trimmed.length > 0 && !trimmed.includes(":")) return trimmed;
  return null;
}

export function renderInline(markdown: string): string {
  const codeSpans: string[] = [];
  let text = escapeHtml(markdown);

  // Code spans come out first and go back in last: their contents are
  // literal, so no later rule may look inside them (`**` in a code span is
  // two asterisks, not the start of bold).
  text = text.replace(/`([^`]+)`/g, (_, code: string) => {
    codeSpans.push(code);
    return `${CODE_OPEN}${codeSpans.length - 1}${CODE_CLOSE}`;
  });

  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (match, alt: string, src: string) => {
    const url = safeUrl(src);
    return url ? `<img src="${url}" alt="${alt}">` : match;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (match, label: string, href: string) => {
    const url = safeUrl(href);
    return url ? `<a href="${url}" rel="noopener noreferrer" target="_blank">${label}</a>` : match;
  });

  text = text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");

  return text.replace(
    new RegExp(`${CODE_OPEN}(\\d+)${CODE_CLOSE}`, "g"),
    (_, index: string) => `<code>${codeSpans[Number(index)]}</code>`,
  );
}

interface ListFrame {
  ordered: boolean;
  task: boolean;
  indent: number;
}

const LIST_ITEM = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/;
const TASK_MARK = /^\[([ xX])\]\s*(.*)$/;
const TABLE_DIVIDER = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

function indentWidth(prefix: string): number {
  return prefix.replace(/\t/g, "    ").length;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** TaskList/TaskItem round-trip through data-type + data-checked — see RichTextEditor.tsx. */
function openList(ordered: boolean, task: boolean): string {
  if (task) return '<ul data-type="taskList">';
  return ordered ? "<ol>" : "<ul>";
}

function closeList(frame: ListFrame): string {
  return frame.ordered ? "</ol>" : "</ul>";
}

function openItem(task: boolean, checked: boolean, html: string): string {
  if (task) return `<li data-type="taskItem" data-checked="${checked}"><p>${html}</p>`;
  return `<li><p>${html}</p>`;
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  const stack: ListFrame[] = [];
  let paragraph: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    out.push(`<p>${paragraph.join("<br>")}</p>`);
    paragraph = [];
  }

  /** Closes every open list indented at or deeper than `indent`. */
  function closeListsFrom(indent: number) {
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      const frame = stack.pop()!;
      out.push("</li>");
      out.push(closeList(frame));
    }
  }

  function closeAllLists() {
    closeListsFrom(0);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "") {
      flushParagraph();
      continue;
    }

    // Fenced code, taken verbatim to its closing fence — or to the end of the
    // file if the writer never closed it.
    const fence = line.match(/^\s*```+\s*([\w+-]*)\s*$/);
    if (fence) {
      flushParagraph();
      closeAllLists();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      const language = fence[1] ? ` class="language-${fence[1]}"` : "";
      out.push(`<pre><code${language}>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeAllLists();
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      continue;
    }

    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      flushParagraph();
      closeAllLists();
      out.push("<hr>");
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      closeAllLists();
      const body = [quote[1]];
      while (i + 1 < lines.length && /^\s*>\s?/.test(lines[i + 1])) {
        body.push(lines[i + 1].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(`<blockquote><p>${body.map((l) => renderInline(l)).join("<br>")}</p></blockquote>`);
      continue;
    }

    // A pipe table is only a table when the line under it is the divider row;
    // otherwise an ordinary sentence containing "|" becomes a one-cell table.
    if (line.includes("|") && i + 1 < lines.length && lines[i + 1].includes("-") && TABLE_DIVIDER.test(lines[i + 1])) {
      flushParagraph();
      closeAllLists();
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i]));
        i++;
      }
      i--;
      const head = `<tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr>`;
      const body = rows
        .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
        .join("");
      out.push(`<table><tbody>${head}${body}</tbody></table>`);
      continue;
    }

    const item = line.match(LIST_ITEM);
    if (item) {
      flushParagraph();
      const indent = indentWidth(item[1]);
      const ordered = item[3] !== undefined;
      let content = item[4];
      const task = TASK_MARK.exec(content);
      const checked = task ? task[1].toLowerCase() === "x" : false;
      if (task) content = task[2];

      const current = stack[stack.length - 1];
      if (current && indent > current.indent) {
        // A nested list belongs *inside* its parent's still-open <li>.
        stack.push({ ordered, task: !!task, indent });
        out.push(openList(ordered, !!task));
      } else {
        closeListsFrom(indent + 1);
        const top = stack[stack.length - 1];
        if (!top) {
          stack.push({ ordered, task: !!task, indent });
          out.push(openList(ordered, !!task));
        } else if (top.ordered !== ordered || top.task !== !!task) {
          // Same indent, different kind of list: close this one and start the
          // other, so bullets never end up inside a numbered list.
          stack.pop();
          out.push("</li>");
          out.push(closeList(top));
          stack.push({ ordered, task: !!task, indent });
          out.push(openList(ordered, !!task));
        } else {
          out.push("</li>");
        }
      }
      out.push(openItem(!!task, checked, renderInline(content)));
      continue;
    }

    closeAllLists();
    paragraph.push(renderInline(line.trim()));
  }

  flushParagraph();
  closeAllLists();
  return out.join("");
}
