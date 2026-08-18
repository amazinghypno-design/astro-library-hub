/**
 * Standalone CLI wrapper around src/services/compressPdfBuffer.ts — see that
 * file for how compression works. This script is for manually shrinking a
 * PDF on disk; the same logic also runs automatically at upload time to
 * generate the inline reader's fast-loading rendition (routers/admin.ts).
 *
 * Usage:
 *   npx tsx scripts/compressPdf.ts <input.pdf> <output.pdf> [--quality=85]
 *
 * --quality: JPEG quality 1-100 (default 85). Lower = smaller file, more
 * visible compression artifacts. 85 is visually close to lossless for scans.
 */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { compressPdfBuffer } from "../src/services/compressPdfBuffer";

async function main() {
  const [inputPath, outputPath, ...flags] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    console.error("Usage: npx tsx scripts/compressPdf.ts <input.pdf> <output.pdf> [--quality=85]");
    process.exit(1);
  }
  const qualityFlag = flags.find((f) => f.startsWith("--quality="));
  const quality = qualityFlag ? Number(qualityFlag.split("=")[1]) : 85;

  const inputBytes = readFileSync(inputPath);
  const inputSizeMb = inputBytes.byteLength / 1024 / 1024;
  console.log(`Input: ${inputPath} (${inputSizeMb.toFixed(2)} MB)`);

  const { bytes, scanPages, copiedPages } = await compressPdfBuffer(inputBytes, { quality });
  console.log(`Processed: ${scanPages} page(s) recompressed, ${copiedPages} page(s) copied as-is`);

  writeFileSync(outputPath, bytes);
  const outputSizeMb = statSync(outputPath).size / 1024 / 1024;
  const reduction = (1 - outputSizeMb / inputSizeMb) * 100;
  console.log(`Output: ${outputPath} (${outputSizeMb.toFixed(2)} MB, ${reduction.toFixed(0)}% smaller)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
