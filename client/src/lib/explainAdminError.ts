/**
 * Admin mutations were failing silently whenever the session expired (401) —
 * no visible feedback, so a delete/edit click just appeared to "do nothing".
 * Every admin mutation's onError should route through this so the real
 * reason is always shown, especially the expired-session case.
 */
export function explainAdminError(err: { message: string; data?: { code?: string } | null }): string {
  const code = err.data?.code;
  if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
    return "เซสชันหมดอายุหรือคุณไม่มีสิทธิ์ทำรายการนี้ กรุณาเข้าสู่ระบบใหม่";
  }
  if (err.message === "CATEGORY_HAS_FILES") {
    return "ลบไม่ได้ เพราะยังมีไฟล์อยู่ในหมวดนี้";
  }
  return `ทำรายการไม่สำเร็จ: ${err.message}`;
}
