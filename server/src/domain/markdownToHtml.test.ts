import { describe, expect, it } from "vitest";
import { markdownToHtml, renderInline } from "./markdownToHtml";

describe("renderInline", () => {
  it("marks up bold, italic, strikethrough and code", () => {
    expect(renderInline("**หนา** *เอียง* ~~ขีดฆ่า~~ `โค้ด`")).toBe(
      "<strong>หนา</strong> <em>เอียง</em> <s>ขีดฆ่า</s> <code>โค้ด</code>",
    );
  });

  it("does not read markdown inside a code span", () => {
    expect(renderInline("`**ไม่หนา**`")).toBe("<code>**ไม่หนา**</code>");
  });

  it("escapes HTML in the source rather than trusting it", () => {
    expect(renderInline('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });

  it("keeps links, and leaves a javascript: URL as plain text", () => {
    expect(renderInline("[คู่มือ](https://example.com/a)")).toBe(
      '<a href="https://example.com/a" rel="noopener noreferrer" target="_blank">คู่มือ</a>',
    );
    expect(renderInline("[กด](javascript:alert(1))")).toBe("[กด](javascript:alert(1))");
  });

  it("renders images", () => {
    expect(renderInline("![ดวง](https://example.com/chart.png)")).toBe(
      '<img src="https://example.com/chart.png" alt="ดวง">',
    );
  });
});

describe("markdownToHtml", () => {
  it("converts headings and paragraphs", () => {
    expect(markdownToHtml("# หัวข้อ\n\nเนื้อความ")).toBe("<h1>หัวข้อ</h1><p>เนื้อความ</p>");
  });

  it("joins consecutive lines into one paragraph and splits on a blank line", () => {
    expect(markdownToHtml("บรรทัดหนึ่ง\nบรรทัดสอง\n\nย่อหน้าใหม่")).toBe(
      "<p>บรรทัดหนึ่ง<br>บรรทัดสอง</p><p>ย่อหน้าใหม่</p>",
    );
  });

  it("converts bullet and numbered lists", () => {
    expect(markdownToHtml("- หนึ่ง\n- สอง")).toBe("<ul><li><p>หนึ่ง</p></li><li><p>สอง</p></li></ul>");
    expect(markdownToHtml("1. หนึ่ง\n2. สอง")).toBe("<ol><li><p>หนึ่ง</p></li><li><p>สอง</p></li></ol>");
  });

  it("nests an indented sub-list inside its parent item", () => {
    expect(markdownToHtml("- แม่\n    - ลูก\n- แม่สอง")).toBe(
      "<ul><li><p>แม่</p><ul><li><p>ลูก</p></li></ul></li><li><p>แม่สอง</p></li></ul>",
    );
  });

  it("starts a new list when the kind changes at the same indent", () => {
    expect(markdownToHtml("- หนึ่ง\n1. สอง")).toBe(
      "<ul><li><p>หนึ่ง</p></li></ul><ol><li><p>สอง</p></li></ol>",
    );
  });

  it("converts Notion checkboxes into task items the editor understands", () => {
    expect(markdownToHtml("- [ ] ยังไม่ทำ\n- [x] ทำแล้ว")).toBe(
      '<ul data-type="taskList">' +
        '<li data-type="taskItem" data-checked="false"><p>ยังไม่ทำ</p></li>' +
        '<li data-type="taskItem" data-checked="true"><p>ทำแล้ว</p></li>' +
        "</ul>",
    );
  });

  it("converts a pipe table", () => {
    const md = "| ดาว | ธาตุ |\n| --- | --- |\n| อาทิตย์ | ไฟ |";
    expect(markdownToHtml(md)).toBe(
      "<table><tbody><tr><th>ดาว</th><th>ธาตุ</th></tr><tr><td>อาทิตย์</td><td>ไฟ</td></tr></tbody></table>",
    );
  });

  it("leaves a sentence containing a pipe as a paragraph", () => {
    expect(markdownToHtml("ราคา 10|20 บาท")).toBe("<p>ราคา 10|20 บาท</p>");
  });

  it("keeps fenced code verbatim", () => {
    expect(markdownToHtml("```ts\nconst a = **1**;\n```")).toBe(
      '<pre><code class="language-ts">const a = **1**;</code></pre>',
    );
  });

  it("closes an unterminated fence at the end of the file", () => {
    expect(markdownToHtml("```\nยังไม่ปิด")).toBe("<pre><code>ยังไม่ปิด</code></pre>");
  });

  it("converts blockquotes and horizontal rules", () => {
    expect(markdownToHtml("> อ้างอิง\n> ต่อ\n\n---")).toBe(
      "<blockquote><p>อ้างอิง<br>ต่อ</p></blockquote><hr>",
    );
  });

  it("closes every list it opened, whatever the file ends with", () => {
    const html = markdownToHtml("- แม่\n    - ลูก");
    expect(html).toBe("<ul><li><p>แม่</p><ul><li><p>ลูก</p></li></ul></li></ul>");
    const opens = (html.match(/<ul>/g) ?? []).length;
    const closes = (html.match(/<\/ul>/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});
