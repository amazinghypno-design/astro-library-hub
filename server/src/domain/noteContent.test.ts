import { describe, expect, it } from "vitest";
import { deriveNoteTitle, htmlToPlainText, sanitizeNoteHtml } from "./noteContent";

describe("sanitizeNoteHtml", () => {
  it("keeps the formatting the editor produces", () => {
    const html = "<h2>หัวข้อ</h2><p><strong>หนา</strong> <em>เอียง</em> <u>ขีดเส้น</u> <s>ขีดฆ่า</s></p>";
    expect(sanitizeNoteHtml(html)).toBe(html);
  });

  it("keeps checklists intact", () => {
    const html = '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>ทำแล้ว</p></li></ul>';
    expect(sanitizeNoteHtml(html)).toBe(html);
  });

  it("keeps text colour, highlight and alignment", () => {
    expect(sanitizeNoteHtml('<p style="text-align:center">กลาง</p>')).toContain("text-align:center");
    expect(sanitizeNoteHtml('<p><span style="color:#b8893a">ทอง</span></p>')).toContain("color:#b8893a");
    expect(sanitizeNoteHtml('<p><mark data-color="#e8c168">เน้น</mark></p>')).toContain('data-color="#e8c168"');
  });

  it("keeps an uploaded font's name on the text set in it", () => {
    expect(sanitizeNoteHtml('<p><span style="font-family: บรรจง">ข้อความ</span></p>')).toContain("font-family:บรรจง");
    expect(sanitizeNoteHtml('<p><span style="font-family: \'Noto Serif Thai\'">ข้อความ</span></p>')).toContain("Noto Serif Thai");
  });

  it("refuses anything in font-family that is not a font name", () => {
    const out = sanitizeNoteHtml('<p><span style="font-family: url(javascript:alert(1))">ข้อความ</span></p>');
    expect(out).not.toContain("javascript");
    expect(out).toContain("ข้อความ");
  });

  it("keeps a chosen text size but not arbitrary CSS lengths", () => {
    expect(sanitizeNoteHtml('<p><span style="font-size: 26px">ใหญ่</span></p>')).toContain("font-size:26px");
    expect(sanitizeNoteHtml('<p><span style="font-size: 9999vw">ระเบิด</span></p>')).not.toContain("9999vw");
  });

  it("strips script pasted in from another app", () => {
    expect(sanitizeNoteHtml('<p>ข้อความ</p><script>alert(1)</script>')).toBe("<p>ข้อความ</p>");
  });

  it("strips an event handler while keeping the element", () => {
    expect(sanitizeNoteHtml('<p onclick="steal()">ข้อความ</p>')).toBe("<p>ข้อความ</p>");
  });

  it("drops a javascript: link but keeps its text", () => {
    const out = sanitizeNoteHtml('<p><a href="javascript:alert(1)">กด</a></p>');
    expect(out).not.toContain("javascript:");
    expect(out).toContain("กด");
  });

  it("sends external links out without a handle on the tab they came from", () => {
    expect(sanitizeNoteHtml('<p><a href="https://example.com">ลิงก์</a></p>')).toContain(
      'rel="noopener noreferrer"',
    );
  });

  it("allows a pasted inline image but no other data: URI", () => {
    expect(sanitizeNoteHtml('<img src="data:image/png;base64,AAAA">')).toContain("data:image/png");
    expect(sanitizeNoteHtml('<p><a href="data:text/html,<b>x</b>">กด</a></p>')).not.toContain("data:text/html");
  });
});

describe("htmlToPlainText", () => {
  it("turns block boundaries into line breaks instead of running text together", () => {
    expect(htmlToPlainText("<p>หนึ่ง</p><p>สอง</p>")).toBe("หนึ่ง\nสอง");
    expect(htmlToPlainText("<ul><li>หนึ่ง</li><li>สอง</li></ul>")).toBe("หนึ่ง\nสอง");
  });

  it("decodes entities", () => {
    expect(htmlToPlainText("<p>a &amp; b &lt;c&gt; &nbsp;d</p>")).toBe("a & b <c> d");
  });

  it("drops script and style bodies rather than reading them as text", () => {
    expect(htmlToPlainText("<p>ข้อความ</p><style>p{color:red}</style>")).toBe("ข้อความ");
  });

  it("collapses runs of blank lines", () => {
    expect(htmlToPlainText("<p>หนึ่ง</p><p></p><p></p><p></p><p>สอง</p>")).toBe("หนึ่ง\n\nสอง");
  });
});

describe("deriveNoteTitle", () => {
  it("names an untitled page after its first line of real text", () => {
    expect(deriveNoteTitle("<h1>โหราศาสตร์ไทย</h1><p>เนื้อความ</p>")).toBe("โหราศาสตร์ไทย");
  });

  it("skips leading empty blocks", () => {
    expect(deriveNoteTitle("<p></p><p>  </p><p>บรรทัดจริง</p>")).toBe("บรรทัดจริง");
  });

  it("falls back when there is nothing written yet", () => {
    expect(deriveNoteTitle("<p></p>")).toBe("ไม่มีชื่อ");
  });
});
