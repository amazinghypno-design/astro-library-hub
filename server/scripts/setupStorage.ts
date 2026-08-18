import { storageBucketName, supabaseAdminClient } from "../src/storage/supabase.js";

async function main() {
  const { data: buckets, error: listError } = await supabaseAdminClient.storage.listBuckets();
  if (listError) throw listError;

  const exists = buckets.some((b) => b.name === storageBucketName);
  if (exists) {
    console.log(`Bucket "${storageBucketName}" already exists.`);
    return;
  }

  const { error: createError } = await supabaseAdminClient.storage.createBucket(storageBucketName, {
    public: false,
  });
  if (createError) throw createError;
  console.log(`Created private bucket "${storageBucketName}".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
