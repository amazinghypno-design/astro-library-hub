import "../env";
import { createClient } from "@supabase/supabase-js";
import type { StorageAdapter } from "./types";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY are not set.");
}

const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "library-files";

// Server-only client using the secret key — full privilege, never sent to the browser.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const SIGNED_URL_TTL_SECONDS = 60 * 10;

export const supabaseStorageAdapter: StorageAdapter = {
  async put(key, bytes, contentType) {
    const { error } = await supabase.storage.from(bucket).upload(key, bytes, {
      contentType,
      upsert: false,
    });
    if (error) throw new Error(`STORAGE_WRITE_FAILED: ${error.message}`);
  },

  async get(key) {
    const { data, error } = await supabase.storage.from(bucket).download(key);
    if (error || !data) throw new Error(`STORAGE_READ_FAILED: ${error?.message ?? "no data"}`);
    return Buffer.from(await data.arrayBuffer());
  },

  async delete(key) {
    const { error } = await supabase.storage.from(bucket).remove([key]);
    if (error) throw new Error(`STORAGE_DELETE_FAILED: ${error.message}`);
  },

  async createDownloadUrl(key, downloadFilename) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(key, SIGNED_URL_TTL_SECONDS, { download: downloadFilename });
    if (error || !data) throw new Error(`PREVIEW_URL_FAILED: ${error?.message ?? "no data"}`);
    return data.signedUrl;
  },

  async createPreviewUrl(key) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(key, SIGNED_URL_TTL_SECONDS);
    if (error || !data) throw new Error(`PREVIEW_URL_FAILED: ${error?.message ?? "no data"}`);
    return data.signedUrl;
  },

  async createUploadUrl(key) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(key);
    if (error || !data) throw new Error(`UPLOAD_URL_FAILED: ${error?.message ?? "no data"}`);
    return data.signedUrl;
  },
};

export { bucket as storageBucketName, supabase as supabaseAdminClient };
