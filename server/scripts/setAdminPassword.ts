import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const password = process.argv[2];
if (!password) {
  console.error("Usage: tsx scripts/setAdminPassword.ts <password>");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, "../../.env");
const content = fs.readFileSync(envPath, "utf-8");
const updated = content.replace(/^ADMIN_PASSWORD_HASH=.*$/m, `ADMIN_PASSWORD_HASH=${hash}`);
fs.writeFileSync(envPath, updated);

console.log("Admin password hash written to .env");
