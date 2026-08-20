import { toThaiErrorMessage } from "./errorMessages";

/**
 * Admin mutations were failing silently whenever the session expired (401) —
 * no visible feedback, so a delete/edit click just appeared to "do nothing".
 * Every admin mutation's onError should route through this so the real
 * reason is always shown, especially the expired-session case.
 *
 * Kept as its own name (rather than inlining toThaiErrorMessage everywhere)
 * because it carries the admin-specific default sentence — the code->Thai
 * table itself lives in errorMessages.ts and is shared with the public pages.
 */
export function explainAdminError(err: { message: string; data?: { code?: string } | null }): string {
  return toThaiErrorMessage(err, "ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
}
