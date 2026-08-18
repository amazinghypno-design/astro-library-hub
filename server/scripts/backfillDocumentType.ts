import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { libraryFiles } from "../src/db/schema";
import { supabaseStorageAdapter } from "../src/storage/supabase";
import { classifyDocumentType } from "../src/domain/classifyDocumentType";
import { inspectPdf } from "../src/services/pdfMetadata";

async function main() {
  const files = await db.select().from(libraryFiles).where(eq(libraryFiles.documentType, "other"));
  console.log(`Found ${files.length} file(s) still at the "other" default.`);

  for (const file of files) {
    let orientation: "portrait" | "landscape" | undefined;
    if (file.mimeType === "application/pdf") {
      try {
        const bytes = await supabaseStorageAdapter.get(file.storageKey);
        const inspection = await inspectPdf(bytes);
        orientation = inspection.pageOrientation;
      } catch (err) {
        console.warn(`  skip orientation for ${file.title}: ${err instanceof Error ? err.message : err}`);
      }
    }
    const documentType = classifyDocumentType(file.mimeType, file.originalName, orientation);
    if (documentType === "other") continue;
    await db.update(libraryFiles).set({ documentType, updatedAt: new Date() }).where(eq(libraryFiles.id, file.id));
    console.log(`  ${file.title}: other -> ${documentType}`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
