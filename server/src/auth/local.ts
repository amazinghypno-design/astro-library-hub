import "../env";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import type { AuthAdapter, SessionUser } from "./types";

/**
 * D3 (see DECISIONS.md): single seeded admin credential from environment
 * variables, no OAuth provider yet. Isolated behind AuthAdapter so a real
 * OAuth provider can replace this later without touching routers/guards.
 */
export const localAuthAdapter: AuthAdapter = {
  async verifyCredentials(email, password): Promise<SessionUser | null> {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminEmail || !adminPasswordHash) {
      throw new Error("ADMIN_EMAIL / ADMIN_PASSWORD_HASH are not configured.");
    }

    if (email.trim().toLowerCase() !== adminEmail.trim().toLowerCase()) return null;

    const passwordMatches = await bcrypt.compare(password, adminPasswordHash);
    if (!passwordMatches) return null;

    const existing = await db.query.users.findFirst({ where: eq(users.email, adminEmail) });
    if (existing) {
      return { id: existing.id, email: existing.email, role: existing.role };
    }

    const [created] = await db
      .insert(users)
      .values({ email: adminEmail, name: "Admin", role: "admin" })
      .returning();
    return { id: created.id, email: created.email, role: created.role };
  },
};
