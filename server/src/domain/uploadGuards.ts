/**
 * Direct-to-storage upload (browser PUTs straight to R2/Supabase — see
 * DECISIONS.md) means the server never sees a gzip/base64-wrapped payload
 * anymore, so only the raw file size and content-integrity checksum matter
 * here now. (Older transport/decoded-size checks existed for the previous
 * browser -> our server -> storage flow and no longer apply.)
 */
export interface UploadLimits {
  maxRawBytes: number;
}

export type UploadGuardErrorCode = "RAW_SIZE_LIMIT" | "CHECKSUM_MISMATCH";

export interface UploadGuardFailure {
  ok: false;
  code: UploadGuardErrorCode;
}

export interface UploadGuardSuccess {
  ok: true;
}

export function checkRawSize(rawBytes: number, limits: UploadLimits): UploadGuardFailure | UploadGuardSuccess {
  if (rawBytes > limits.maxRawBytes) return { ok: false, code: "RAW_SIZE_LIMIT" };
  return { ok: true };
}

export function checkChecksum(expectedSha256: string, actualSha256: string): UploadGuardFailure | UploadGuardSuccess {
  if (expectedSha256.toLowerCase() !== actualSha256.toLowerCase()) {
    return { ok: false, code: "CHECKSUM_MISMATCH" };
  }
  return { ok: true };
}
