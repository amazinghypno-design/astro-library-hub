import "../env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

// Supabase's session-mode pooler caps the whole project at 15 client
// connections, and that budget is shared: this pool, the express-session
// store's own pool, and every other running instance of this server (a local
// dev server alongside the deployed one, or two Render instances during a
// rolling deploy) all draw from it. postgres.js defaults to 10, which is
// enough on its own to starve the others and fail requests with
// EMAXCONNSESSION. Four is comfortably more than this workload needs — the
// heaviest endpoint issues two queries in sequence.
const client = postgres(process.env.DATABASE_URL, { prepare: false, max: 4 });

export const db = drizzle(client, { schema });
