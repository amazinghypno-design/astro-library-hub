export type UploadStage = "hashing" | "uploading" | "finalizing" | "completed" | "failed";

export interface UploadProgress {
  loadedBytes: number;
  totalBytes: number;
  /** Bytes/sec, cumulative average since the PUT started — smoother than per-event deltas. */
  speedBytesPerSec: number;
  /** Seconds, based on current average speed. Null until we have a stable enough reading. */
  etaSeconds: number | null;
}

export interface PreparedDirectUpload {
  storageKey: string;
  originalName: string;
  mimeType: string;
  rawSize: number;
  checksumSha256: string;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Uploads a file directly to storage (R2/Supabase) — the browser PUTs bytes
 * straight to the presigned URL, never through our own server. Old flow
 * (gzip + base64 + tRPC through our server) added ~33% transport overhead
 * from base64 alone, plus real CPU time gzip-compressing files that are
 * almost always already-compressed (PDFs, Office docs) for zero benefit, and
 * fetch can't report upload progress at all — XMLHttpRequest can.
 */
export async function uploadFileDirect(
  file: File,
  createUploadUrl: (input: { originalName: string; mimeType: string; rawSize: number }) => Promise<{ uploadUrl: string; storageKey: string }>,
  onStage: (stage: UploadStage) => void,
  onProgress: (progress: UploadProgress) => void,
): Promise<PreparedDirectUpload> {
  const mimeType = file.type || "application/octet-stream";

  onStage("hashing");
  const buffer = await file.arrayBuffer();
  const checksumSha256 = await sha256Hex(buffer);

  const { uploadUrl, storageKey } = await createUploadUrl({ originalName: file.name, mimeType, rawSize: file.size });

  onStage("uploading");
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", mimeType);

    const startedAt = Date.now();
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const elapsedSec = (Date.now() - startedAt) / 1000;
      const speedBytesPerSec = elapsedSec > 0.2 ? e.loaded / elapsedSec : 0;
      const remaining = e.total - e.loaded;
      onProgress({
        loadedBytes: e.loaded,
        totalBytes: e.total,
        speedBytesPerSec,
        etaSeconds: speedBytesPerSec > 0 ? remaining / speedBytesPerSec : null,
      });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`UPLOAD_FAILED (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("UPLOAD_FAILED"));
    xhr.send(file);
  });

  return { storageKey, originalName: file.name, mimeType, rawSize: file.size, checksumSha256 };
}
