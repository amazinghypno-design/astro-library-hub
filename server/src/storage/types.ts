export interface StoredObject {
  key: string;
  bytes: number;
}

export interface StorageAdapter {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  createDownloadUrl(key: string, downloadFilename: string): Promise<string>;
  createPreviewUrl(key: string): Promise<string>;
  /** A presigned URL the browser can PUT bytes to directly — bypasses our own server for the (slow) file transfer. */
  createUploadUrl(key: string, contentType: string): Promise<string>;
  /**
   * Every object the bucket actually holds, paged through to the end. The only
   * way to see bytes no database row accounts for — and a paid operation on
   * R2, so callers make it a deliberate action rather than a poll.
   */
  listAll(): Promise<StoredObject[]>;
}
