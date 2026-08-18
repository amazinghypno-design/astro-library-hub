/**
 * One-time migration: copies every existing library file's bytes from
 * Supabase Storage into the new R2 bucket, keyed by the same storageKey —
 * so switching STORAGE_DRIVER to "r2" afterward doesn't orphan anything
 * already uploaded. Run BEFORE flipping STORAGE_DRIVER in .env.
 *
 * Usage: npx tsx scripts/migrateToR2.ts
 */
import "dotenv/config";
import { db } from "../src/db/client";
import { libraryFiles } from "../src/db/schema";
import { supabaseStorageAdapter } from "../src/storage/supabase";
import { r2StorageAdapter } from "../src/storage/r2";
import { storageContentType } from "../src/domain/contentType";

async function main() {
  const files = await db.select().from(libraryFiles);
  console.log(`Found ${files.length} file(s) to migrate.`);

  for (const file of files) {
    process.stdout.write(`  ${file.title} (${file.storageKey})... `);
    const bytes = await supabaseStorageAdapter.get(file.storageKey);
    await r2StorageAdapter.put(file.storageKey, bytes, storageContentType(file.mimeType));
    console.log(`done (${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB)`);
  }

  console.log("Migration complete. Verify the files in the R2 dashboard, then set STORAGE_DRIVER=r2 in .env.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
