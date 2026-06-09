import "dotenv/config";
import { defineConfig } from "prisma/config";

type DbVariant = "supabase" | "pg" | "sqlite";

const variant: DbVariant = ((process.env.DB_VARIANT ?? "supabase") as DbVariant);

const schemaByVariant: Record<DbVariant, string> = {
  supabase: "prisma/schema.prisma",
  pg: "prisma/schema.pg.prisma",
  sqlite: "prisma/schema.sqlite.prisma",
};

const migrationsByVariant: Record<DbVariant, string> = {
  supabase: "prisma/migrations",
  pg: "prisma/migrations-pg",
  sqlite: "prisma/migrations-sqlite",
};

function resolveDatasourceUrl(): string {
  if (variant === "sqlite") {
    return process.env.DATABASE_URL?.startsWith("file:") || process.env.DATABASE_URL?.endsWith(".db")
      ? process.env.DATABASE_URL
      : "file:./prisma/data.db";
  }
  // Gunakan process.env langsung (tidak strict) agar prisma generate tetap jalan
  // meskipun DATABASE_URL belum tersedia (misal saat npm install di Vercel)
  return process.env.DATABASE_URL || "";
}

export default defineConfig({
  schema: schemaByVariant[variant],
  migrations: {
    path: migrationsByVariant[variant],
    seed: "tsx prisma/seed.sqlite.ts",
  },
  datasource: {
    url: resolveDatasourceUrl(),
  },
});
