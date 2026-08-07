import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

import { env, isDevelopment } from "./env";

/**
 * Cliente Prisma como singleton.
 *
 * En desarrollo, Next.js recarga los módulos en cada cambio. Sin el singleton
 * global se abriría un pool de conexiones nuevo en cada recarga hasta agotar
 * los slots de Postgres.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    // Límite conservador: Postgres acepta ~100 conexiones por defecto y en
    // serverless cada instancia abre su propio pool.
    max: 10,
  });

  return new PrismaClient({
    adapter,
    log: isDevelopment ? ["warn", "error"] : ["error"],
  });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (isDevelopment) {
  globalForPrisma.prisma = db;
}

/**
 * Tipo del cliente dentro de una transacción.
 *
 * Los repositorios reciben `DbClient`, no `PrismaClient`, para poder
 * ejecutarse indistintamente dentro o fuera de una transacción. Ese detalle es
 * lo que permite componer operaciones atómicas sin duplicar código de acceso a
 * datos.
 */
export type DbClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$transaction" | "$extends"
>;
