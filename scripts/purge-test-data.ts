import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Elimina los negocios creados por los tests de integración.
 *
 *   npx tsx scripts/purge-test-data.ts
 *
 * POR QUÉ HACE FALTA
 * ---------------------------------------------------------------------------
 * Los tests de integración crean su propio negocio, con nombre prefijado
 * `[test] `, y lo borran al terminar. Si una suite se interrumpe o su limpieza
 * falla, esos datos quedan huérfanos.
 *
 * Mientras tests y demo compartan base de datos, esa basura es visible para el
 * cliente. Este script la retira sin tocar nada más: el filtro por prefijo es
 * estricto y jamás puede alcanzar un negocio real.
 *
 * RECOMENDACIÓN: provisiona una base separada para tests y apunta ahí
 * DATABASE_URL al ejecutarlos (ver docs/development.md). Este script es la red
 * de seguridad, no la solución.
 */

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const testBusinesses = await db.business.findMany({
    where: { name: { startsWith: "[test] " } },
    select: { id: true, name: true },
  });

  if (testBusinesses.length === 0) {
    console.log("✓ No hay datos de test que purgar.");
    return;
  }

  console.log(`→ Purgando ${testBusinesses.length} negocio(s) de prueba…`);

  for (const business of testBusinesses) {
    // Orden de dependencia: `Payment` referencia a `PaymentMethod` sin
    // cascade, deliberadamente (impide borrar un método de pago con cobros
    // asociados en producción).
    await db.payment.deleteMany({ where: { sale: { businessId: business.id } } });
    await db.inventoryMovement.deleteMany({ where: { businessId: business.id } });
    await db.saleItem.deleteMany({ where: { sale: { businessId: business.id } } });
    await db.sale.deleteMany({ where: { businessId: business.id } });
    await db.business.delete({ where: { id: business.id } });

    console.log(`  ✓ ${business.name}`);
  }

  console.log("\n✓ Purga completada.");
}

main()
  .catch((error) => {
    console.error("✗ Error al purgar:", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
