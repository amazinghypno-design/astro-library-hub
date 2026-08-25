/**
 * Single place that turns any thrown error into a Thai sentence a librarian
 * can act on.
 *
 * The server keeps throwing stable SCREAMING_SNAKE codes (DUPLICATE_FILE,
 * RAW_SIZE_LIMIT, ...) on purpose — they're a machine-readable contract that
 * server tests and the duplicate-detail payload depend on, and they must not
 * drift when we reword a sentence. Translation belongs here, on the display
 * side, which is also the only layer that can see the errors the server never
 * produces at all: the browser's direct-to-R2 PUT failing, a dropped
 * connection, or pdf.js refusing a file.
 *
 * Rule for every message below: say what happened AND what to do next. A user
 * who sees "UPLOAD_FAILED (403)" learns nothing; "ลิงก์อัปโหลดหมดอายุ กรุณาเลือกไฟล์ใหม่"
 * tells them their next click.
 */

/** Server codes (TRPCError message) -> Thai. Keys must match the server exactly. */
const SERVER_CODE_MESSAGES: Record<string, string> = {
  // --- Categories ---
  CATEGORY_SLUG_EXISTS: "มีหมวดหมู่ชื่อนี้อยู่แล้ว กรุณาใช้ชื่ออื่น",
  CATEGORY_HAS_FILES: "ลบหมวดหมู่นี้ไม่ได้ เพราะยังมีไฟล์อยู่ข้างใน กรุณาย้ายหรือลบไฟล์ออกก่อน",
  CATEGORY_NOT_FOUND: "ไม่พบหมวดหมู่ที่เลือก อาจถูกลบไปแล้ว กรุณารีเฟรชหน้าแล้วเลือกหมวดใหม่",

  // --- Upload ---
  DUPLICATE_FILE: "มีไฟล์ชื่อเรื่องนี้อยู่แล้วในหมวดนี้ กรุณาเปลี่ยนชื่อเรื่อง หรือเลือกหมวดหมู่อื่น",
  RAW_SIZE_LIMIT: "ไฟล์มีขนาดใหญ่เกินกว่าที่ระบบรับได้ กรุณาบีบอัดไฟล์ให้เล็กลงแล้วลองใหม่",
  CHECKSUM_MISMATCH: "ไฟล์ที่อัปโหลดไม่ครบถ้วน (ข้อมูลไม่ตรงกับไฟล์ต้นฉบับ) กรุณาอัปโหลดใหม่อีกครั้ง",
  UPLOAD_NOT_FOUND: "ไม่พบไฟล์ที่อัปโหลดไว้ อาจถูกลบหรือลิงก์หมดอายุ กรุณาเลือกไฟล์แล้วอัปโหลดใหม่",

  // --- Files & preview ---
  FILE_NOT_FOUND: "ไม่พบไฟล์นี้ อาจถูกลบไปแล้ว",
  FILE_NOT_PUBLIC: "ไฟล์นี้ยังไม่ถูกเผยแพร่ จึงยังเปิดดูไม่ได้",
  PREVIEW_UNSUPPORTED: "ไฟล์ประเภทนี้ยังพรีวิวในเว็บไม่ได้ กรุณาดาวน์โหลดไปเปิดด้วยโปรแกรมในเครื่อง",
  PREVIEW_RENDER_FAILED: "สร้างภาพพรีวิวไม่สำเร็จ ไฟล์อาจเสียหายหรืออยู่ในรูปแบบที่ระบบอ่านไม่ได้",
  STORAGE_READ_FAILED: "อ่านไฟล์จากที่เก็บข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  STORAGE_DELETE_FAILED: "ลบไฟล์ออกจากที่เก็บข้อมูลไม่สำเร็จ จึงยังไม่ได้ลบรายการนี้ กรุณาลองกดลบใหม่อีกครั้ง",

  // --- Share links ---
  SHARE_LINK_NOT_FOUND: "ไม่พบลิงก์แชร์นี้",
  SHARE_LINK_INVALID_OR_EXPIRED: "ลิงก์แชร์นี้ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่จากผู้ดูแล",

  // --- AI librarian ---
  AI_REQUEST_FAILED: "ระบบผู้ช่วย AI ตอบไม่สำเร็จ กรุณาลองถามใหม่อีกครั้ง",

  // --- Auth ---
  // A failed login and an expired session are both UNAUTHORIZED at the
  // transport level, so the code alone can't tell them apart — the message
  // can. authRouter.login sets "Invalid email or password" explicitly, while
  // the adminProcedure/authedProcedure middleware throws with no message at
  // all, which tRPC fills in with the code name itself.
  "Invalid email or password": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  UNAUTHORIZED: "เซสชันหมดอายุหรือคุณไม่มีสิทธิ์ทำรายการนี้ กรุณาเข้าสู่ระบบใหม่",
  FORBIDDEN: "เซสชันหมดอายุหรือคุณไม่มีสิทธิ์ทำรายการนี้ กรุณาเข้าสู่ระบบใหม่",
};

/** tRPC's transport-level codes (err.data.code) -> Thai, used when the message itself isn't one we know. */
const TRPC_CODE_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "เซสชันหมดอายุหรือคุณไม่มีสิทธิ์ทำรายการนี้ กรุณาเข้าสู่ระบบใหม่",
  FORBIDDEN: "เซสชันหมดอายุหรือคุณไม่มีสิทธิ์ทำรายการนี้ กรุณาเข้าสู่ระบบใหม่",
  PAYLOAD_TOO_LARGE: "ไฟล์มีขนาดใหญ่เกินกว่าที่ระบบรับได้ กรุณาบีบอัดไฟล์ให้เล็กลงแล้วลองใหม่",
  TIMEOUT: "ระบบใช้เวลานานเกินไปจนหมดเวลา กรุณาลองใหม่อีกครั้ง",
  TOO_MANY_REQUESTS: "ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  NOT_FOUND: "ไม่พบข้อมูลที่ต้องการ อาจถูกลบไปแล้ว กรุณารีเฟรชหน้าอีกครั้ง",
  BAD_REQUEST: "ข้อมูลที่กรอกไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่",
  CONFLICT: "ทำรายการไม่สำเร็จ เพราะข้อมูลนี้ขัดแย้งกับข้อมูลที่มีอยู่แล้ว",
  INTERNAL_SERVER_ERROR: "เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง",
};

/**
 * The browser PUTs bytes straight to R2, so these HTTP statuses come from the
 * storage provider — never from our own server — and each one has a genuinely
 * different fix. A bare "อัปโหลดไม่สำเร็จ" here would hide, for example, that the
 * bucket's CORS rules are the thing that's actually broken.
 */
function explainDirectUploadStatus(status: number): string {
  if (status === 0) {
    return "เชื่อมต่อกับที่เก็บไฟล์ไม่ได้ อาจเกิดจากอินเทอร์เน็ตหลุด หรือการตั้งค่า CORS ของที่เก็บไฟล์ กรุณาลองใหม่อีกครั้ง";
  }
  if (status === 400) return "ที่เก็บไฟล์ปฏิเสธไฟล์นี้ กรุณาลองเลือกไฟล์ใหม่อีกครั้ง";
  if (status === 401 || status === 403) {
    return "ลิงก์สำหรับอัปโหลดหมดอายุหรือไม่มีสิทธิ์ใช้งาน กรุณาเลือกไฟล์แล้วอัปโหลดใหม่อีกครั้ง";
  }
  if (status === 413) return "ไฟล์มีขนาดใหญ่เกินกว่าที่ที่เก็บไฟล์รับได้ กรุณาบีบอัดไฟล์ให้เล็กลง";
  if (status >= 500) return "ที่เก็บไฟล์ขัดข้องชั่วคราว กรุณาลองอัปโหลดใหม่อีกสักครู่";
  return `อัปโหลดไฟล์ไม่สำเร็จ (รหัส ${status}) กรุณาลองใหม่อีกครั้ง`;
}

/** Browser-level network failures surface as English strings that differ per browser. */
function explainNetworkFailure(message: string): string | null {
  const NETWORK_HINTS = ["failed to fetch", "networkerror", "load failed", "network request failed", "err_network"];
  const lower = message.toLowerCase();
  if (NETWORK_HINTS.some((hint) => lower.includes(hint))) {
    return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง";
  }
  if (lower.includes("aborted") || lower.includes("abort")) {
    return "การเชื่อมต่อถูกยกเลิกกลางคัน กรุณาลองใหม่อีกครั้ง";
  }
  return null;
}

function rawMessageOf(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return "";
}

function trpcCodeOf(err: unknown): string | undefined {
  if (!err || typeof err !== "object" || !("data" in err)) return undefined;
  const data = (err as { data?: { code?: string } | null }).data;
  return data?.code;
}

/**
 * Turns anything thrown anywhere in the app into a Thai sentence.
 *
 * `fallback` is the Thai sentence to use when nothing matches — pass one that
 * names the action that failed ("บันทึกไฟล์ไม่สำเร็จ") so an unmapped error still
 * reads as Thai instead of leaking a code.
 */
export function toThaiErrorMessage(err: unknown, fallback = "ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"): string {
  const raw = rawMessageOf(err).trim();

  // The message is checked before err.data.code because it is the more
  // specific of the two: a wrong password on the login form arrives as
  // UNAUTHORIZED, and answering that with "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" would
  // tell someone who is logging in right now to go and log in.
  const trpcCode = trpcCodeOf(err);
  if (SERVER_CODE_MESSAGES[raw]) return SERVER_CODE_MESSAGES[raw];

  // UPLOAD_NOT_FOUND arrives as "UPLOAD_NOT_FOUND: <storage detail>" — the
  // detail is for the server log, not for the person looking at the screen.
  const prefixMatch = raw.match(/^([A-Z][A-Z0-9_]+):/);
  if (prefixMatch && SERVER_CODE_MESSAGES[prefixMatch[1]]) return SERVER_CODE_MESSAGES[prefixMatch[1]];

  // Thrown by lib/upload.ts as "UPLOAD_FAILED" or "UPLOAD_FAILED (403)".
  const uploadMatch = raw.match(/^UPLOAD_FAILED(?:\s*\((\d+)\))?$/);
  if (uploadMatch) return explainDirectUploadStatus(uploadMatch[1] ? Number(uploadMatch[1]) : 0);

  const network = explainNetworkFailure(raw);
  if (network) return network;

  if (trpcCode && TRPC_CODE_MESSAGES[trpcCode]) return TRPC_CODE_MESSAGES[trpcCode];

  return fallback;
}

/**
 * pdf.js reports its own English exceptions ("Invalid PDF structure",
 * "PasswordException", ...). They're the reader's only clue about why a book
 * won't open, so they get their own mapping rather than collapsing into a
 * generic failure message.
 */
export function toThaiPdfErrorMessage(err: unknown): string {
  const raw = rawMessageOf(err);
  const lower = raw.toLowerCase();

  if (lower.includes("password")) return "ไฟล์ PDF นี้ถูกตั้งรหัสผ่านไว้ จึงเปิดอ่านในเว็บไม่ได้";
  if (lower.includes("invalid pdf") || lower.includes("corrupt")) return "ไฟล์ PDF เสียหายหรืออยู่ในรูปแบบที่ระบบอ่านไม่ได้";
  if (lower.includes("missing pdf") || lower.includes("unexpected server response")) {
    return "โหลดไฟล์ PDF ไม่สำเร็จ ลิงก์อาจหมดอายุ กรุณารีเฟรชหน้าอีกครั้ง";
  }

  const network = explainNetworkFailure(raw);
  if (network) return network;

  return "เปิดไฟล์ PDF ไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองใหม่อีกครั้ง";
}
