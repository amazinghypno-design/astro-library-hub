export interface ShareLinkRecord {
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export type ShareLinkStatus = "valid" | "expired" | "revoked";

/** Pure so the expiry/revoke rule is testable without a DB or a clock mock trick. */
export function shareLinkStatus(link: ShareLinkRecord, now: Date): ShareLinkStatus {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

export function isShareLinkValid(link: ShareLinkRecord, now: Date): boolean {
  return shareLinkStatus(link, now) === "valid";
}
