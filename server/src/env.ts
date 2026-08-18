import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Resolved from this file's own location, not process.cwd(), so it works
// regardless of which directory a command is invoked from — and must be the
// first import in any module that reads process.env at module-load time,
// since ESM import hoisting otherwise runs that module's env checks before
// a caller's own dotenv.config() call.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });
