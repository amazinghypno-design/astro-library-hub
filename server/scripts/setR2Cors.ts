/**
 * R2 buckets have no CORS policy by default, unlike Supabase Storage (which
 * allows cross-origin reads out of the box). The client fetches PDF bytes
 * directly from the signed URL in the browser (PdfReader.tsx uses pdfjs-dist
 * against the raw URL, not a server proxy), so without this the browser
 * blocks it with "Failed to fetch". Access is still gated by the short-lived
 * signed URL our server generates after its own auth checks — this only
 * controls whether browser JS may read a response it could already fetch.
 *
 * Usage: npx tsx scripts/setR2Cors.ts
 */
import "../src/env";
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
  throw new Error("R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME are not set.");
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function main() {
  await client.send(
    new PutBucketCorsCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ["*"],
            AllowedMethods: ["GET", "HEAD", "PUT"],
            AllowedHeaders: ["*"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  console.log("CORS policy applied to bucket:", process.env.R2_BUCKET_NAME);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
