import { router } from "./trpc";
import { authRouter } from "./auth";
import { libraryRouter } from "./library";
import { adminRouter } from "./admin";
import { progressRouter } from "./progress";
import { usageRouter } from "./usage";
import { notesRouter } from "./notes";
import { skillsRouter } from "./skills";
import { fontsRouter } from "./fonts";
import { subjectsRouter } from "./subjects";

export const appRouter = router({
  auth: authRouter,
  library: libraryRouter,
  admin: adminRouter,
  progress: progressRouter,
  usage: usageRouter,
  notes: notesRouter,
  skills: skillsRouter,
  fonts: fontsRouter,
  subjects: subjectsRouter,
});

export type AppRouter = typeof appRouter;
