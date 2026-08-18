import { createHash, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";

const BASE = "http://localhost:4000/trpc";
const TARGET_MB = Number(process.argv[2] ?? 95);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_TEST_PASSWORD = process.env.ADMIN_TEST_PASSWORD;
if (!ADMIN_TEST_PASSWORD) throw new Error("Set ADMIN_TEST_PASSWORD in the environment to run this script.");

async function main() {
  const loginRes = await fetch(`${BASE}/auth.login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_TEST_PASSWORD }),
  });
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("login failed");

  const catRes = await fetch(`${BASE}/library.categories`);
  const cats = (await catRes.json()) as { result: { data: { id: string }[] } };
  const categoryId = cats.result.data[0].id;

  console.log(`Generating a ${TARGET_MB}MB synthetic file (mostly-random bytes, so gzip can't cheat)...`);
  const size = TARGET_MB * 1024 * 1024;
  const buffer = Buffer.alloc(size);
  // Fill in chunks (randomBytes has a max size) — realistic worst case for gzip (low compressibility)
  const chunkSize = 4 * 1024 * 1024;
  for (let offset = 0; offset < size; offset += chunkSize) {
    randomBytes(Math.min(chunkSize, size - offset)).copy(buffer, offset);
  }

  const t0 = Date.now();
  const checksumSha256 = createHash("sha256").update(buffer).digest("hex");
  console.log(`checksum computed in ${Date.now() - t0}ms`);

  const t1 = Date.now();
  const gzipped = gzipSync(buffer);
  console.log(`gzip: ${(gzipped.byteLength / 1024 / 1024).toFixed(1)}MB (from ${TARGET_MB}MB raw) in ${Date.now() - t1}ms`);

  const t2 = Date.now();
  const payloadBase64Gzip = gzipped.toString("base64");
  console.log(`base64 encode: ${(payloadBase64Gzip.length / 1024 / 1024).toFixed(1)}MB in ${Date.now() - t2}ms`);

  const t3 = Date.now();
  const uploadRes = await fetch(`${BASE}/admin.upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      originalName: `stress-test-${TARGET_MB}mb.bin`,
      mimeType: "application/octet-stream",
      rawSize: buffer.byteLength,
      checksumSha256,
      payloadBase64Gzip,
      categoryId,
      title: `Stress test ${TARGET_MB}MB (fixture, safe to delete)`,
      tags: ["stress-test-fixture"],
      status: "draft",
    }),
  });
  console.log(`upload request: ${uploadRes.status} in ${Date.now() - t3}ms`);
  const uploadJson = await uploadRes.json();
  if (!uploadRes.ok) {
    console.error(JSON.stringify(uploadJson, null, 2));
    throw new Error("upload failed");
  }
  const fileId = uploadJson.result.data.id;
  console.log("uploaded, id =", fileId);

  const t4 = Date.now();
  const dlRes = await fetch(`${BASE}/admin.fileDownloadUrl?input=${encodeURIComponent(JSON.stringify({ id: fileId }))}`, {
    headers: { Cookie: cookie },
  });
  const dlJson = await dlRes.json();
  const downloadUrl = dlJson.result.data.url;
  const downloaded = Buffer.from(await (await fetch(downloadUrl)).arrayBuffer());
  console.log(`download + fetch: ${(downloaded.byteLength / 1024 / 1024).toFixed(1)}MB in ${Date.now() - t4}ms`);

  const downloadedChecksum = createHash("sha256").update(downloaded).digest("hex");
  const match = downloadedChecksum === checksumSha256;
  console.log("byte-perfect round trip:", match);
  if (!match) throw new Error("CHECKSUM MISMATCH");

  console.log(`\nCleaning up stress-test fixture (id=${fileId})...`);
  await fetch(`${BASE}/admin.deleteFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ id: fileId }),
  });
  console.log("deleted. TOTAL WALL TIME:", Date.now() - t0, "ms");
}

main().catch((err) => {
  console.error("STRESS TEST FAILED", err);
  process.exit(1);
});
