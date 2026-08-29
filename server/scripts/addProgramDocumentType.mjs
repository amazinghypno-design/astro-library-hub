/**
 * One-off, additive migration: gives the document_type enum the "program"
 * value that server/src/db/schema.ts now declares — the type used for Excel
 * program files (.xlsm/.xlsb/.xltm). Safe to run more than once.
 *
 * Done as a script rather than through `drizzle-kit push` because Postgres
 * only grows an enum with ALTER TYPE ... ADD VALUE; push offers to drop and
 * recreate the type instead, which would take every library_files row's
 * document_type with it.
 */
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: new URL("../../.env", import.meta.url).pathname });

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

// BEFORE 'slide' only to keep the stored order the same as the order declared
// in schema.ts. Nothing sorts by document_type, so this is tidiness, not need.
await sql.unsafe(`ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'program' BEFORE 'slide'`);

const values = await sql`
  select enumlabel
  from pg_enum
  where enumtypid = 'document_type'::regtype
  order by enumsortorder
`;
console.log("document_type values:", values.map((v) => v.enumlabel).join(", "));
await sql.end();
