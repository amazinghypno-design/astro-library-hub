import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import path from "node:path";

const BASE = "http://localhost:4000/trpc";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_TEST_PASSWORD = process.env.ADMIN_TEST_PASSWORD;
if (!ADMIN_TEST_PASSWORD) throw new Error("Set ADMIN_TEST_PASSWORD in the environment to run this script.");

const filePath = process.argv[2];
const title = process.argv[3];
const author = process.argv[4] ?? "";
const categoryName = process.argv[5];

if (!filePath || !title || !categoryName) {
  console.error("Usage: tsx scripts/uploadRealFile.ts <filePath> <title> <author> <categoryName>");
  process.exit(1);
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".txt": "text/plain",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}

async function main() {
  const loginRes = await fetch(`${BASE}/auth.login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_TEST_PASSWORD }),
  });
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("login failed, no cookie");

  const catsRes = await fetch(`${BASE}/library.categories`);
  const cats = (await catsRes.json()) as { result: { data: { id: string; name: string }[] } };
  let category = cats.result.data.find((c) => c.name === categoryName);
  if (!category) {
    const createRes = await fetch(`${BASE}/admin.createCategory`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ name: categoryName, slug: categoryName.replace(/\s+/g, "-").toLowerCase() }),
    });
    const createJson = await createRes.json();
    category = createJson.result.data;
    console.log("created category:", category!.name);
  }

  const originalName = path.basename(filePath);
  const buffer = readFileSync(filePath);
  console.log(`read ${originalName}: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

  const checksumSha256 = createHash("sha256").update(buffer).digest("hex");
  console.log("computed checksum");

  const t0 = Date.now();
  const gzipped = gzipSync(buffer);
  console.log(`gzipped: ${(gzipped.byteLength / 1024 / 1024).toFixed(2)} MB in ${Date.now() - t0}ms`);
  const payloadBase64Gzip = gzipped.toString("base64");

  const mimeType = mimeFromExt(path.extname(filePath));

  const t1 = Date.now();
  const uploadRes = await fetch(`${BASE}/admin.upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      originalName,
      mimeType,
      rawSize: buffer.byteLength,
      checksumSha256,
      payloadBase64Gzip,
      categoryId: category!.id,
      title,
      author: author || undefined,
      tags: [],
      status: "published",
    }),
  });
  console.log(`upload request took ${Date.now() - t1}ms, status ${uploadRes.status}`);
  const json = await uploadRes.json();
  console.log(JSON.stringify(json, null, 2));
}

main().catch((err) => {
  console.error("FAILED", err);
  process.exit(1);
});
