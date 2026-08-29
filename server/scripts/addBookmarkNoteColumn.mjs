/**
 * One-off, additive migration: gives bookmarks the `note` column that
 * server/src/db/schema.ts now declares. Safe to run more than once.
 */
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: new URL("../../.env", import.meta.url).pathname });

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
await sql`ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT ''`;
const cols = await sql`
  select column_name, data_type, column_default, is_nullable
  from information_schema.columns
  where table_name = 'bookmarks' and column_name = 'note'
`;
const [{ c }] = await sql`select count(*)::int as c from bookmarks`;
console.log("note column:", JSON.stringify(cols));
console.log("existing bookmark rows:", c);
await sql.end();
