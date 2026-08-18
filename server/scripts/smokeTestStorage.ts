import { supabaseStorageAdapter } from "../src/storage/supabase.js";
import crypto from "node:crypto";

async function main() {
  const key = `smoke-test/${crypto.randomUUID()}.txt`;
  const original = Buffer.from("Astro Library Hub smoke test — สวัสดีครับ", "utf-8");

  await supabaseStorageAdapter.put(key, original, "text/plain");
  console.log("put: ok");

  const downloadUrl = await supabaseStorageAdapter.createDownloadUrl(key, "ทดสอบ.txt");
  const previewUrl = await supabaseStorageAdapter.createPreviewUrl(key);
  console.log("signed urls generated:", { downloadUrl: downloadUrl.slice(0, 60) + "...", previewUrl: previewUrl.slice(0, 60) + "..." });

  const roundTrip = await supabaseStorageAdapter.get(key);
  const match = roundTrip.equals(original);
  console.log("round-trip byte-equal:", match);
  if (!match) throw new Error("Round-trip mismatch!");

  await supabaseStorageAdapter.delete(key);
  console.log("delete: ok");

  try {
    await supabaseStorageAdapter.get(key);
    throw new Error("Expected get() to fail after delete, but it succeeded");
  } catch {
    console.log("confirmed deleted (get after delete failed as expected)");
  }
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED", err);
  process.exit(1);
});
