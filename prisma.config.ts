import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // `prisma db seed` delega en este script.
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
    // Base "sombra": Prisma la usa para diffear migraciones sin tocar la real.
    // Solo se define en desarrollo.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"] || undefined,
  },
});
