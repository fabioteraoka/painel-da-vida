import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baselineMigration = "20260923000000_initial_schema";
const prismaCli = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../node_modules/prisma/build/index.js",
);

function runPrisma(args) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env.VERCEL !== "1") {
  console.log("Skipping automatic database migrations outside Vercel builds.");
  process.exit(0);
}

const prisma = new PrismaClient();

try {
  const [state] = await prisma.$queryRaw`
    SELECT
      to_regclass('public."_prisma_migrations"') IS NOT NULL AS has_migrations_table,
      to_regclass('public."User"') IS NOT NULL AS has_app_schema
  `;

  let hasMigrationHistory = false;
  let baselineApplied = false;

  if (state.has_migrations_table) {
    const [history] = await prisma.$queryRaw`
      SELECT
        EXISTS (SELECT 1 FROM public."_prisma_migrations") AS has_history,
        EXISTS (
          SELECT 1 FROM public."_prisma_migrations"
          WHERE migration_name = ${baselineMigration}
            AND finished_at IS NOT NULL
        ) AS baseline_applied
    `;
    hasMigrationHistory = history.has_history;
    baselineApplied = history.baseline_applied;
  }

  if (state.has_app_schema && !hasMigrationHistory && !baselineApplied) {
    console.log("Existing database detected; recording the initial Prisma baseline.");
    runPrisma(["migrate", "resolve", "--applied", baselineMigration]);
  }
} finally {
  await prisma.$disconnect();
}

runPrisma(["migrate", "deploy"]);
