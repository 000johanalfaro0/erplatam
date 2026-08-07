import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Desbloquea una cuenta bloqueada por intentos fallidos.
 *
 *   npx tsx scripts/unlock-user.ts admin@erp.local
 *
 * Existe porque durante el desarrollo y las pruebas es fácil dispararse el
 * bloqueo a uno mismo, y esperar quince minutos no aporta nada. En producción
 * es la herramienta para atender a un empleado que olvidó su contraseña y se
 * bloqueó — sin tocar la base de datos a mano.
 */
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const email = process.argv[2]?.toLowerCase();

  if (!email) {
    console.error("Uso: npx tsx scripts/unlock-user.ts <correo>");
    process.exitCode = 1;
    return;
  }

  const result = await db.user.updateMany({
    where: { email },
    data: { failedAttempts: 0, lockedUntil: null },
  });

  console.log(
    result.count > 0
      ? `✓ Cuenta desbloqueada: ${email}`
      : `✗ No se encontró ningún usuario con el correo ${email}`,
  );
}

main()
  .catch((error) => {
    console.error("✗ Error:", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
