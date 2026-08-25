import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { libraryFiles } from "../db/schema";
import { storageAdapter } from "../storage/index";
import { adminProcedure, router } from "./trpc";

/**
 * What the library is costing, in bytes.
 *
 * Split deliberately into two procedures with different costs. `summary` is
 * derived entirely from the database — the size of every file is already a
 * column, so the whole answer is one cheap query that is safe to poll every
 * few seconds. `bucketScan` asks the object store to list every object it
 * actually holds, which is the only way to see bytes the database has
 * forgotten about, and is a paid Class A operation on R2 — so it runs only
 * when the admin presses the button, never on a timer.
 *
 * The two numbers disagreeing is itself the useful signal: whatever the scan
 * finds beyond what the rows account for is orphaned, and orphaned bytes are
 * pure bill (see scripts/findOrphanedObjects.ts).
 */

/**
 * Free-plan ceilings, as env overrides rather than constants, because they are
 * a property of somebody's account and not of this code — and because a plan
 * upgrade should not need a deploy. Defaults are Cloudflare R2's 10GB of
 * storage and Supabase's 500MB of Postgres on their free tiers.
 */
const STORAGE_QUOTA_BYTES = Number(process.env.STORAGE_QUOTA_BYTES ?? 10 * 1024 ** 3);
const DATABASE_QUOTA_BYTES = Number(process.env.DATABASE_QUOTA_BYTES ?? 500 * 1024 ** 2);

export const usageRouter = router({
  summary: adminProcedure.query(async () => {
    // One round-trip, for the reason spelled out in library.ts's dashboard:
    // the session pooler allows very few connections and a fan-out of
    // parallel aggregates exhausts it.
    const [totals] = await db
      .select({
        fileCount: sql<number>`count(*)`.mapWith(Number),
        storedBytes: sql<number>`coalesce(sum(${libraryFiles.size}), 0)`.mapWith(Number),
        largestBytes: sql<number>`coalesce(max(${libraryFiles.size}), 0)`.mapWith(Number),
        // The text OCR and extraction have accumulated. It lives in the
        // database rather than the bucket, so it counts against a completely
        // different, and much smaller, ceiling.
        textBytes: sql<number>`coalesce(sum(octet_length(coalesce(${libraryFiles.extractedText}, ''))), 0)`.mapWith(Number),
        withText: sql<number>`count(*) filter (where ${libraryFiles.extractedText} is not null and ${libraryFiles.extractedText} <> '')`.mapWith(Number),
        // Renditions are a second object per file, so they are real stored
        // bytes the size column never counted.
        withRendition: sql<number>`count(*) filter (where ${libraryFiles.previewStorageKey} is not null)`.mapWith(Number),
      })
      .from(libraryFiles);

    const byType = await db
      .select({
        documentType: libraryFiles.documentType,
        fileCount: sql<number>`count(*)`.mapWith(Number),
        bytes: sql<number>`coalesce(sum(${libraryFiles.size}), 0)`.mapWith(Number),
      })
      .from(libraryFiles)
      .groupBy(libraryFiles.documentType)
      .orderBy(sql`sum(${libraryFiles.size}) desc`);

    const largest = await db
      .select({
        id: libraryFiles.id,
        title: libraryFiles.title,
        bytes: libraryFiles.size,
        mimeType: libraryFiles.mimeType,
      })
      .from(libraryFiles)
      .orderBy(sql`${libraryFiles.size} desc`)
      .limit(8);

    // pg_database_size is the honest figure — indexes, bloat and all — rather
    // than the sum of the rows, which always reads lower than the number the
    // hosting plan is measured against.
    const dbSizeRows = await db.execute<{ bytes: string }>(sql`select pg_database_size(current_database()) as bytes`);
    const databaseBytes = Number(dbSizeRows[0]?.bytes ?? 0);

    return {
      files: {
        count: totals.fileCount,
        withText: totals.withText,
        withRendition: totals.withRendition,
        largestBytes: totals.largestBytes,
      },
      storage: {
        /** Sum of the original uploads. Renditions are extra and only the bucket scan sees them. */
        accountedBytes: totals.storedBytes,
        quotaBytes: STORAGE_QUOTA_BYTES,
      },
      database: {
        totalBytes: databaseBytes,
        extractedTextBytes: totals.textBytes,
        quotaBytes: DATABASE_QUOTA_BYTES,
      },
      byType,
      largest,
      measuredAt: new Date().toISOString(),
    };
  }),

  /**
   * Lists the bucket for real. Costs a paid operation and takes a moment, so
   * it is a button, not a poll.
   */
  bucketScan: adminProcedure.input(z.object({}).optional()).mutation(async () => {
    const rows = await db
      .select({ key: libraryFiles.storageKey, preview: libraryFiles.previewStorageKey })
      .from(libraryFiles);
    const referenced = new Set<string>();
    for (const row of rows) {
      referenced.add(row.key);
      if (row.preview) referenced.add(row.preview);
    }

    const objects = await storageAdapter.listAll();
    let totalBytes = 0;
    let orphanBytes = 0;
    const orphans: { key: string; bytes: number }[] = [];
    for (const object of objects) {
      totalBytes += object.bytes;
      if (!referenced.has(object.key)) {
        orphanBytes += object.bytes;
        orphans.push(object);
      }
    }

    return {
      objectCount: objects.length,
      totalBytes,
      orphanCount: orphans.length,
      orphanBytes,
      orphans: orphans.sort((a, b) => b.bytes - a.bytes).slice(0, 20),
      scannedAt: new Date().toISOString(),
    };
  }),
});
