import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/modules/auth/password";

/**
 * Prepara el usuario con el que entra quien abra la demo sin contraseña.
 *
 *   npx tsx scripts/preparar-acceso-libre.ts
 *
 * Crea —o reactiva— un "Invitado" con rol de Encargado. Se elige Encargado y
 * no Administrador a propósito: recorre y usa todo el sistema, pero no puede
 * crear usuarios, cambiar el IVA ni tocar la configuración. Quien viene a
 * mirar no necesita nada de eso, y así una visita curiosa no puede dejar el
 * negocio sin administradores ni cambiar cómo se calcula el dinero.
 *
 * La contraseña se genera al azar y no se enseña: con la puerta abierta no
 * hace falta, y si mañana se cierra la puerta, esta cuenta no queda con una
 * contraseña conocida circulando por ahí.
 */

const CORREO = "invitado@erp.local";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    const negocio = await prisma.business.findFirst({
      select: { id: true, name: true },
    });
    if (!negocio) throw new Error("No hay negocio. Ejecuta `npm run db:seed`.");

    const rol = await prisma.role.findFirst({
      where: { businessId: negocio.id, key: "MANAGER" },
      select: { id: true, name: true },
    });
    if (!rol) throw new Error("No existe el rol MANAGER.");

    const passwordHash = await hashPassword(
      crypto.randomUUID() + crypto.randomUUID(),
    );

    const invitado = await prisma.user.upsert({
      where: { businessId_email: { businessId: negocio.id, email: CORREO } },
      create: {
        businessId: negocio.id,
        email: CORREO,
        name: "Invitado",
        passwordHash,
        roleId: rol.id,
      },
      update: {
        status: "ACTIVE",
        roleId: rol.id,
        deletedAt: null,
        failedAttempts: 0,
        lockedUntil: null,
      },
      select: { id: true, name: true, email: true },
    });

    console.log(`✓ Usuario listo: ${invitado.name} <${invitado.email}>  (${rol.name})`);
    console.log(`
Para abrir la puerta:

  npx vercel env add DEMO_ACCESO_LIBRE production --scope johan-alfaro-mejias-projects
  # valor: ${CORREO}
  npx vercel deploy --prod --yes --scope johan-alfaro-mejias-projects

Para cerrarla:

  npx vercel env rm DEMO_ACCESO_LIBRE production --yes --scope johan-alfaro-mejias-projects
  npx vercel deploy --prod --yes --scope johan-alfaro-mejias-projects
`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("✗", error.message);
  process.exitCode = 1;
});
