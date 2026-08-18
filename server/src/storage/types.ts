export interface StorageAdapter {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  createDownloadUrl(key: string, downloadFilename: string): Promise<string>;
  createPreviewUrl(key: string): Promise<string>;
  /** A presigned URL the browser can PUT bytes to directly — bypasses our own server for the (slow) file transfer. */
  createUploadUrl(key: string, contentType: string): Promise<string>;
}
