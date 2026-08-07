import "dotenv/config";
import { createInterface } from "node:readline/promises";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Reinicio controlado del entorno de demo (requisito 23).
 *
 *   npx tsx scripts/reset-demo.ts --feedback      solo las anotaciones
 *   npx tsx scripts/reset-demo.ts --movimientos   ventas, compras, gastos
 *   npx tsx scripts/reset-demo.ts --todo          todo lo transaccional
 *
 * FILOSOFÍA: destruir datos es fácil de hacer y difícil de deshacer. Por eso
 * este script:
 *
 *   1. Exige indicar QUÉ borrar. Sin argumentos no hace nada.
 *   2. Muestra el recuento exacto ANTES de tocar nada.
 *   3. Pide confirmación escribiendo el nombre del negocio. Un "sí" se teclea
 *      por inercia; el nombre del negocio, no.
 *   4. NUNCA borra el catálogo (productos, clientes, proveedores) salvo que se
 *      pida explícitamente, porque es lo que más trabajo cuesta recapturar.
 *   5. NUNCA borra usuarios, roles ni configuración: dejaría el sistema
 *      inutilizable.
 *
 * Los contadores de folios NO se reinician. Reiniciarlos generaría folios
 * duplicados con documentos que quizá ya se imprimieron o se enviaron.
 */

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const args = new Set(process.argv.slice(2));

const borrarFeedback = args.has("--feedback") || args.has("--todo");
const borrarMovimientos = args.has("--movimientos") || args.has("--todo");
const borrarCatalogo = args.has("--catalogo");
const sinConfirmar = args.has("--si");

function uso() {
  console.log(`
Reinicio controlado del entorno de demo.

  --feedback      Borra las anotaciones del modo feedback.
  --movimientos   Borra ventas, compras, gastos y movimientos de inventario.
                  El catálogo se conserva, pero las existencias vuelven a cero.
  --catalogo      Borra además productos, clientes y proveedores. PELIGROSO.
  --todo          Equivale a --feedback --movimientos.
  --si            Omite la confirmación. Solo para automatización.

Nunca se borran usuarios, roles ni configuración del negocio.
`);
}

async function main() {
  if (!borrarFeedback && !borrarMovimientos && !borrarCatalogo) {
    uso();
    return;
  }

  const business = await db.business.findFirst({
    where: { deletedAt: null, name: { not: { startsWith: "[test] " } } },
    select: { id: true, name: true },
  });

  if (!business) {
    console.log("✗ No se encontró ningún negocio.");
    return;
  }

  // --- Recuento previo -----------------------------------------------------
  const [ventas, compras, gastos, movimientos, anotaciones, productos] =
    await Promise.all([
      db.sale.count({ where: { businessId: business.id } }),
      db.purchase.count({ where: { businessId: business.id } }),
      db.expense.count({ where: { businessId: business.id } }),
      db.inventoryMovement.count({ where: { businessId: business.id } }),
      db.feedbackItem.count({ where: { businessId: business.id } }),
      db.product.count({ where: { businessId: business.id, deletedAt: null } }),
    ]);

  console.log(`\nNegocio: ${business.name}\n`);
  console.log("Se va a BORRAR:");
  if (borrarFeedback) console.log(`  · ${anotaciones} anotación(es) de feedback`);
  if (borrarMovimientos) {
    console.log(`  · ${ventas} venta(s)`);
    console.log(`  · ${compras} compra(s)`);
    console.log(`  · ${gastos} gasto(s)`);
    console.log(`  · ${movimientos} movimiento(s) de inventario`);
    console.log(`  · las existencias de ${productos} producto(s) volverán a 0`);
  }
  if (borrarCatalogo) {
    console.log(`  · ${productos} producto(s), y todos los clientes y proveedores`);
  }

  console.log("\nSe CONSERVA: usuarios, roles, configuración, impuestos,");
  console.log("             métodos de pago y los contadores de folios.\n");

  // --- Confirmación --------------------------------------------------------
  if (!sinConfirmar) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const respuesta = await rl.question(
      `Para confirmar, escribe el nombre del negocio (${business.name}): `,
    );
    rl.close();

    if (respuesta.trim() !== business.name) {
      console.log("\n✗ Cancelado: el nombre no coincide. No se borró nada.");
      return;
    }
  }

  // --- Ejecución, en orden de dependencia ----------------------------------
  if (borrarFeedback) {
    // FeedbackScreenshot cae por cascade desde FeedbackItem.
    const { count } = await db.feedbackItem.deleteMany({
      where: { businessId: business.id },
    });
    console.log(`✓ ${count} anotación(es) borrada(s)`);
  }

  if (borrarMovimientos || borrarCatalogo) {
    // Payment referencia a PaymentMethod SIN cascade, deliberadamente: en
    // producción impide borrar un método de pago que ya tiene cobros. Por eso
    // hay que borrar los pagos explícitamente y en este orden.
    await db.payment.deleteMany({ where: { sale: { businessId: business.id } } });
    await db.inventoryMovement.deleteMany({ where: { businessId: business.id } });
    await db.saleItem.deleteMany({ where: { sale: { businessId: business.id } } });
    await db.purchaseItem.deleteMany({
      where: { purchase: { businessId: business.id } },
    });
    await db.sale.deleteMany({ where: { businessId: business.id } });
    await db.purchase.deleteMany({ where: { businessId: business.id } });
    await db.expense.deleteMany({ where: { businessId: business.id } });

    // Las existencias vuelven a cero porque su libro mayor ya no existe.
    // Dejarlas con valor sería exactamente la inconsistencia que todo el
    // sistema se esfuerza en impedir.
    await db.product.updateMany({
      where: { businessId: business.id },
      data: { stock: 0 },
    });

    console.log("✓ Ventas, compras, gastos y movimientos borrados");
    console.log("✓ Existencias puestas a 0 (su libro mayor ya no existe)");
  }

  if (borrarCatalogo) {
    await db.product.deleteMany({ where: { businessId: business.id } });
    await db.customer.deleteMany({ where: { businessId: business.id } });
    await db.supplier.deleteMany({ where: { businessId: business.id } });
    await db.category.deleteMany({ where: { businessId: business.id } });
    console.log("✓ Catálogo borrado");
  }

  // La bitácora de auditoría NO se borra: es el registro de lo que ocurrió,
  // incluido este mismo reinicio. Borrarla sería contradecir su propósito.
  console.log("\n✓ Listo. La bitácora de auditoría se conserva intacta.");

  if (borrarMovimientos && !borrarCatalogo) {
    console.log("\n  Para reponer existencias: npx tsx prisma/seed.ts --demo");
  }
}

main()
  .catch((error) => {
    console.error("\n✗ Error:", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
