import { describe, expect, it } from "vitest";
import { isShareLinkValid, shareLinkStatus } from "./shareLink";

const now = new Date("2026-08-18T00:00:00Z");

describe("shareLinkStatus", () => {
  it("is valid with no expiry and no revoke", () => {
    expect(shareLinkStatus({ expiresAt: null, revokedAt: null }, now)).toBe("valid");
  });

  it("is valid before expiry", () => {
    expect(shareLinkStatus({ expiresAt: new Date("2026-08-19T00:00:00Z"), revokedAt: null }, now)).toBe("valid");
  });

  it("is expired at or after the expiry instant", () => {
    expect(shareLinkStatus({ expiresAt: new Date("2026-08-18T00:00:00Z"), revokedAt: null }, now)).toBe("expired");
    expect(shareLinkStatus({ expiresAt: new Date("2026-08-17T00:00:00Z"), revokedAt: null }, now)).toBe("expired");
  });

  it("revoked takes priority even if not yet expired", () => {
    expect(
      shareLinkStatus({ expiresAt: new Date("2026-08-19T00:00:00Z"), revokedAt: new Date("2026-08-17T00:00:00Z") }, now),
    ).toBe("revoked");
  });
});

describe("isShareLinkValid", () => {
  it("true only for valid status", () => {
    expect(isShareLinkValid({ expiresAt: null, revokedAt: null }, now)).toBe(true);
    expect(isShareLinkValid({ expiresAt: new Date("2026-08-01T00:00:00Z"), revokedAt: null }, now)).toBe(false);
  });
});
