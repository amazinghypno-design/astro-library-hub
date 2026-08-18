/**
 * Normalizes a title/filename for duplicate comparison within one category.
 * Duplicate checks must run before any storage/DB write — see
 * PROJECT-SPECIFICATION.md section 4 and TROUBLESHOOTING-HANDBOOK.md
 * "duplicate แต่ยังเขียน storage".
 */
export function normalizeForDuplicateCheck(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\.[a-z0-9]+$/i, ""); // strip a trailing file extension, if any
}

export interface ExistingFileCandidate {
  id: string;
  title: string;
  originalName: string;
  categoryId: string | null;
}

export interface DuplicateMatch {
  existingFileId: string;
  existingFileName: string;
  existingTitle: string;
}

export function findDuplicate(
  candidateTitle: string,
  candidateOriginalName: string,
  candidateCategoryId: string,
  existingFiles: ExistingFileCandidate[],
): DuplicateMatch | null {
  const normalizedTitle = normalizeForDuplicateCheck(candidateTitle);
  const normalizedName = normalizeForDuplicateCheck(candidateOriginalName);

  const match = existingFiles.find((file) => {
    if (file.categoryId !== candidateCategoryId) return false;
    const existingTitle = normalizeForDuplicateCheck(file.title);
    const existingName = normalizeForDuplicateCheck(file.originalName);
    return existingTitle === normalizedTitle || existingName === normalizedName;
  });

  if (!match) return null;

  return {
    existingFileId: match.id,
    existingFileName: match.originalName,
    existingTitle: match.title,
  };
}
