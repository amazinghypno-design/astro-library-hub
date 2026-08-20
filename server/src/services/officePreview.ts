import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { libraryFiles } from "../db/schema";
import { previewCapability } from "../domain/previewCapability";
import { storageAdapter } from "../storage/index";
import { getCachedPreview, setCachedPreview } from "./previewCache";

export interface OfficePreviewResult {
  html: string | null;
  sheets: { name: string; html: string }[] | null;
}

const loadRenderer = () => import("./renderOfficePreview");

const cacheKeyFor = (fileId: string) => `preview:${fileId}`;

/** Thrown when the file could not be read from storage, as opposed to failing to convert. */
export const STORAGE_READ_FAILED = "STORAGE_READ_FAILED";

/**
 * The one place that turns a stored Word/Excel file into preview HTML, so the
 * request path and the boot-time warmer cannot drift apart on caching rules.
 */
export async function renderOfficePreviewCached(file: {
  id: string;
  mimeType: string;
  originalName: string;
  storageKey: string;
}): Promise<OfficePreviewResult> {
  const cached = getCachedPreview<OfficePreviewResult>(cacheKeyFor(file.id));
  if (cached) return cached;

  const capability = previewCapability(file.mimeType, file.originalName);

  let bytes: Buffer;
  try {
    bytes = await storageAdapter.get(file.storageKey);
  } catch {
    // Named so callers can tell "storage was unreachable, try again" apart
    // from "this file cannot be converted" without matching on SDK text.
    // (No `cause`: the client typechecks these server types under a lower
    // target where the two-argument Error constructor does not exist.)
    throw new Error(STORAGE_READ_FAILED);
  }

  const { renderDocxToHtml, renderXlsxToSheets } = await loadRenderer();
  const result: OfficePreviewResult =
    capability === "docx-inline"
      ? { html: await renderDocxToHtml(bytes), sheets: null }
      : { html: null, sheets: await renderXlsxToSheets(bytes) };

  setCachedPreview(cacheKeyFor(file.id), result);
  return result;
}

/**
 * Converts every published Office document once, in the background, shortly
 * after boot.
 *
 * Without this the first reader to open a Word file after a restart pays the
 * whole conversion — ~11s on the free instance's half CPU, most of it
 * re-encoding embedded images. The work has to happen either way; doing it
 * while nobody is waiting is strictly better than doing it while someone is.
 *
 * Deliberately sequential and best-effort: this shares half a CPU and 512MB
 * with real requests, so it must not race them or take the process down if a
 * file is unreadable.
 */
export async function warmOfficePreviewCache(): Promise<void> {
  try {
    const files = await db
      .select({
        id: libraryFiles.id,
        mimeType: libraryFiles.mimeType,
        originalName: libraryFiles.originalName,
        storageKey: libraryFiles.storageKey,
      })
      .from(libraryFiles)
      .where(and(eq(libraryFiles.status, "published"), eq(libraryFiles.visibility, "public")));

    const office = files.filter((f) => {
      const capability = previewCapability(f.mimeType, f.originalName);
      return capability === "docx-inline" || capability === "xlsx-inline";
    });
    if (office.length === 0) return;

    for (const file of office) {
      try {
        await renderOfficePreviewCached(file);
      } catch {
        // An unreadable file is that file's problem, not the warmer's.
      }
    }
    console.log(`Office preview cache warmed for ${office.length} file(s)`);
  } catch {
    // Database unavailable at boot — the request path still renders on demand.
  }
}
