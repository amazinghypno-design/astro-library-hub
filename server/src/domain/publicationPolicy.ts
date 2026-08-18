export type FileStatus = "draft" | "published" | "archived";
export type FileVisibility = "public" | "private";

/**
 * Status and visibility must always move together — never let the client
 * send Published while the server keeps Draft, or vice versa.
 * See PROJECT-SPECIFICATION.md section 5.
 */
export function visibilityForStatus(status: FileStatus): FileVisibility {
  return status === "published" ? "public" : "private";
}

export interface MetadataCompleteness {
  hasTitle: boolean;
  hasCategoryId: boolean;
}

/**
 * A file may only default to Published when metadata + category are
 * complete. Admin can still explicitly choose Draft/Archived regardless.
 */
export function defaultStatusForNewUpload(metadata: MetadataCompleteness): FileStatus {
  if (metadata.hasTitle && metadata.hasCategoryId) return "published";
  return "draft";
}

export function isPubliclyVisible(status: FileStatus, visibility: FileVisibility): boolean {
  return status === "published" && visibility === "public";
}
