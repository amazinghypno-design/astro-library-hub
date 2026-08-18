import { router } from "./trpc";
import { authRouter } from "./auth";
import { libraryRouter } from "./library";
import { adminRouter } from "./admin";
import { progressRouter } from "./progress";

export const appRouter = router({
  auth: authRouter,
  library: libraryRouter,
  admin: adminRouter,
  progress: progressRouter,
});

export type AppRouter = typeof appRouter;
