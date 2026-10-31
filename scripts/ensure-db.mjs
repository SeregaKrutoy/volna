// Создаёт таблицы в базе при первом запуске (drizzle-kit push), чтобы API работали сразу.
import { execSync } from "node:child_process";

try {
  execSync("npx drizzle-kit push --force", { stdio: "inherit", env: process.env });
} catch (error) {
  console.warn("[volna] drizzle-kit push failed (database may be unavailable yet):", error?.message || error);
}
