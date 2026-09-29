import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Request } from "express";
import type { SessionUser } from "../auth/types";
import { invalidateReadCache } from "../readCache";

export interface Context {
  user: SessionUser | null;
  req: Request;
}

export function createContext({ req }: CreateExpressContextOptions): Context {
  const user = (req as unknown as { session?: { user?: SessionUser } }).session?.user ?? null;
  return { user, req };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;

/**
 * Any write can change what the public pages show, so a successful mutation
 * forgets everything readCache remembered. The exceptions only ever write
 * one reader's own state (reading position, highlights, the session itself),
 * which no cached read contains — clearing on them would throw the cache away
 * every time someone turns a page.
 */
const ownStateOnly = /^(progress|auth|usage)\./;
const invalidateOnMutation = t.middleware(async ({ type, path, next }) => {
  const result = await next();
  if (type === "mutation" && result.ok && !ownStateOnly.test(path)) invalidateReadCache();
  return result;
});
const baseProcedure = t.procedure.use(invalidateOnMutation);

export const publicProcedure = baseProcedure;

/** Any logged-in account (public reader or admin) — used for account-scoped features like reading progress/bookmarks. */
export const authedProcedure = baseProcedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = baseProcedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
