import "../env";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageAdapter, StoredObject } from "./types";

if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
  throw new Error("R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME are not set.");
}

const bucket = process.env.R2_BUCKET_NAME;

// R2 speaks the S3 API — same SDK as AWS S3, pointed at Cloudflare's endpoint.
// No per-object size caps like Supabase Storage's 50MB project setting (see
// DECISIONS.md D9) — R2 supports objects well beyond what this app needs.
const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const SIGNED_URL_TTL_SECONDS = 60 * 10;
// Longer TTL for uploads specifically — a big scanned book on a slow
// connection can take a while, and the URL must still be valid when the PUT
// finally finishes, not just when it starts.
const UPLOAD_URL_TTL_SECONDS = 60 * 60;

export const r2StorageAdapter: StorageAdapter = {
  async put(key, bytes, contentType) {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType }));
  },

  async get(key) {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) throw new Error("STORAGE_READ_FAILED: no data");
    const chunks: Uint8Array[] = [];
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);
    return Buffer.concat(chunks);
  },

  async delete(key) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },

  async listAll() {
    const objects: StoredObject[] = [];
    // One page holds 1000 keys at most, so this loops until the bucket says
    // it has no more — a library well past 1000 files still gets a true total.
    let token: string | undefined;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
      for (const object of page.Contents ?? []) {
        if (object.Key) objects.push({ key: object.Key, bytes: object.Size ?? 0 });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return objects;
  },

  async createDownloadUrl(key, downloadFilename) {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`,
    });
    return getSignedUrl(client, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
  },

  async createPreviewUrl(key) {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(client, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
  },

  async createUploadUrl(key, contentType) {
    const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
    return getSignedUrl(client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
  },
};

export { bucket as storageBucketName };
