import "dotenv/config";
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { db } from "../src/db/client";
import { libraryFiles } from "../src/db/schema";

/**
 * Finds file bytes in the bucket that no row in the database points at.
 *
 * Two things leave them behind. An upload that never became a row — the
 * browser PUTs the bytes straight to storage before finalizeUpload is called,
 * so an abandoned or failed upload leaves its object there. And, until the
 * fix in routers/admin.ts, a delete whose storage call failed: the error was
 * swallowed and the row went anyway.
 *
 * Nothing in the app can see these objects or reach them again — they are
 * only a bill. But this DELETES REAL FILES, so it lists by default and needs
 * --delete spelled out, and it is worth reading the list before agreeing to
 * it: a key here is a file that is genuinely unreferenced, not necessarily a
 * file nobody wanted.
 *
 *   npx tsx scripts/findOrphanedObjects.ts             # list only
 *   npx tsx scripts/findOrphanedObjects.ts --delete    # remove them for good
 */

const remove = process.argv.includes("--delete");

const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);

const bucket = process.env.R2_BUCKET_NAME!;
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function main() {
  // Every key any row still refers to: the original, and the reader's
  // recompressed rendition where one was generated.
  const referenced = new Set<string>();
  const rows = await db.select({ key: libraryFiles.storageKey, preview: libraryFiles.previewStorageKey }).from(libraryFiles);
  for (const row of rows) {
    referenced.add(row.key);
    if (row.preview) referenced.add(row.preview);
  }

  const orphans: { key: string; bytes: number }[] = [];
  let objectCount = 0;
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    for (const object of page.Contents ?? []) {
      objectCount++;
      if (object.Key && !referenced.has(object.Key)) orphans.push({ key: object.Key, bytes: object.Size ?? 0 });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  const wasted = orphans.reduce((sum, o) => sum + o.bytes, 0);
  console.log(`${objectCount} object(s) in "${bucket}", ${referenced.size} referenced by a file row.`);
  console.log(`${orphans.length} orphan(s), ${(wasted / 1024 / 1024).toFixed(1)} MB nothing points at.\n`);

  for (const orphan of orphans.sort((a, b) => b.bytes - a.bytes)) {
    console.log(`  ${(orphan.bytes / 1024 / 1024).toFixed(1).padStart(8)} MB  ${orphan.key}`);
  }

  if (orphans.length === 0) return;
  if (!remove) {
    console.log("\nNothing was deleted. Re-run with --delete to remove them permanently.");
    return;
  }

  console.log("\nDeleting...");
  let deleted = 0;
  for (const orphan of orphans) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: orphan.key }));
      deleted++;
    } catch (err) {
      console.warn(`  FAILED ${orphan.key}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`Deleted ${deleted} of ${orphans.length}, freeing ${(wasted / 1024 / 1024).toFixed(1)} MB.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
