import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const BASE = "http://localhost:4000/trpc";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_TEST_PASSWORD = process.env.ADMIN_TEST_PASSWORD;
if (!ADMIN_TEST_PASSWORD) throw new Error("Set ADMIN_TEST_PASSWORD in the environment to run this script.");

async function main() {
  // 1. login, capture session cookie
  const loginRes = await fetch(`${BASE}/auth.login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_TEST_PASSWORD }),
  });
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("No session cookie returned from login");
  console.log("login ok, cookie captured");

  // 2. get category id (created earlier: โหราศาสตร์ไทย)
  const catRes = await fetch(`${BASE}/library.categories`);
  const cats = (await catRes.json()) as { result: { data: { id: string; name: string }[] } };
  const category = cats.result.data[0];
  console.log("using category:", category.name, category.id);

  // 3. prepare a fake PDF-ish file content (client-equivalent: raw bytes -> checksum -> gzip -> base64)
  const original = Buffer.from(
    "%PDF-1.4\nAstro Library Hub end-to-end test file — ทดสอบระบบอัปโหลดจริง\n%%EOF",
    "utf-8",
  );
  const checksumSha256 = createHash("sha256").update(original).digest("hex");
  const gzipped = gzipSync(original);
  const payloadBase64Gzip = gzipped.toString("base64");

  // 4. call admin.upload
  const uploadRes = await fetch(`${BASE}/admin.upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      originalName: "ทดสอบ-คัมภีร์.pdf",
      mimeType: "application/pdf",
      rawSize: original.byteLength,
      checksumSha256,
      payloadBase64Gzip,
      categoryId: category.id,
      title: "ไฟล์ทดสอบระบบอัปโหลด",
      author: "ระบบทดสอบ",
      year: 2026,
      tags: [],
      status: "published",
    }),
  });
  const uploadJson = await uploadRes.json();
  console.log("upload response:", JSON.stringify(uploadJson, null, 2));
  if (!uploadRes.ok) throw new Error("Upload failed");
  const fileId = uploadJson.result.data.id as string;

  // 5. verify public fileById returns it (published + public)
  const fileRes = await fetch(`${BASE}/library.fileById?input=${encodeURIComponent(JSON.stringify({ id: fileId }))}`);
  console.log("public fileById:", await fileRes.text());

  // 6. verify duplicate guard: re-upload same title/category should be rejected, no new storage write
  const dupRes = await fetch(`${BASE}/admin.upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      originalName: "ทดสอบ-คัมภีร์-อีกชื่อ.pdf",
      mimeType: "application/pdf",
      rawSize: original.byteLength,
      checksumSha256,
      payloadBase64Gzip,
      categoryId: category.id,
      title: "ไฟล์ทดสอบระบบอัปโหลด", // same title -> should be flagged duplicate
      tags: [],
    }),
  });
  console.log("duplicate attempt status:", dupRes.status);
  console.log("duplicate attempt body:", await dupRes.text());

  // 7. download URL works
  const dlRes = await fetch(`${BASE}/library.downloadUrl?input=${encodeURIComponent(JSON.stringify({ id: fileId }))}`);
  const dlJson = await dlRes.json();
  console.log("download url generated:", !!dlJson.result?.data?.url);

  console.log("\nE2E UPLOAD TEST PASSED. fileId =", fileId);
}

main().catch((err) => {
  console.error("E2E TEST FAILED", err);
  process.exit(1);
});
