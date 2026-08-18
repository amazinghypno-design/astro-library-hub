import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { localAuthAdapter } from "../auth/local";
import { router, publicProcedure } from "./trpc";
import type { SessionUser } from "../auth/types";

type SessionLike = { user?: SessionUser; destroy: (cb: () => void) => void };

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),

  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const user = await localAuthAdapter.verifyCredentials(input.email, input.password);
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }
      const session = (ctx.req as unknown as { session?: SessionLike }).session;
      if (session) session.user = user;
      return user;
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    const session = (ctx.req as unknown as { session?: SessionLike }).session;
    if (session) session.destroy(() => {});
    return { ok: true };
  }),
});
