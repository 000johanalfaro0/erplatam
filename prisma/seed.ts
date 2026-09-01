import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Seed del entorno.
 *
 * PROPIEDAD CLAVE: es idempotente. Ejecutarlo diez veces deja la base en el
 * mismo estado que ejecutarlo una. Usa `upsert` en todo, nunca `create` a
 * secas. Motivo práctico: durante la demo habrá que reejecutarlo tras alguna
 * migración, y no puede duplicar el catálogo ni pisar datos reales del
 * cliente.
 *
 * Lo que crea SIEMPRE (estructura mínima para que el sistema funcione):
 *   - El negocio y su configuración
 *   - Roles del sistema y sus permisos
 *   - El usuario administrador
 *   - Tasas de impuesto (IVA 16%, IVA 0%, Exento)
 *   - Métodos de pago
 *   - Contadores de folios
 *
 * Lo que crea SOLO con `--demo` (datos de ejemplo, desechables):
 *   - Categorías, proveedores, productos y clientes de muestra
 *
 * La separación es deliberada: el cliente va a capturar SUS productos reales.
 * Sembrar catálogo falso por defecto ensuciaría la demo, que es justo lo que
 * el requisito 23 pide evitar.
 */

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const db = new PrismaClient({ adapter });

const withDemoData = process.argv.includes("--demo");

// --- Permisos por rol (espejo de src/server/core/permissions.ts) ------------
// Se duplican aquí a propósito: el seed corre con `tsx` fuera del bundle de
// Next, y arrastrar el grafo de imports de la aplicación por tres constantes
// no compensa. La prueba `tests/unit/seed-roles.test.ts` verifica que ambas
// listas coincidan, así que la duplicación no puede desincronizarse en
// silencio.
const ROLE_DEFINITIONS = {
  ADMIN: {
    name: "Administrador",
    description: "Acceso total al sistema y a la configuración.",
    permissions: ["*"],
  },
  MANAGER: {
    name: "Encargado",
    description:
      "Opera el negocio: vende, compra, ajusta inventario y consulta reportes.",
    permissions: [
      "products:read",
      "products:write",
      "categories:write",
      "customers:read",
      "customers:write",
      "suppliers:read",
      "suppliers:write",
      "sales:read",
      "sales:create",
      "sales:void",
      "inventory:read",
      "inventory:adjust",
      "purchases:read",
      "purchases:write",
      "purchases:void",
      "expenses:read",
      "expenses:write",
      "reports:read",
      "audit:read",
      "settings:read",
      "feedback:create",
      "feedback:manage",
      "discovery:write",
    ],
  },
  EMPLOYEE: {
    name: "Cajero",
    description: "Registra ventas y consulta productos y clientes.",
    permissions: [
      "products:read",
      "customers:read",
      "customers:write",
      "sales:read",
      "sales:create",
      "inventory:read",
      "expenses:read",
      "expenses:write",
      "feedback:create",
    ],
  },
} as const;

async function main() {
  console.log("→ Sembrando entorno…");

  const businessName = process.env.SEED_BUSINESS_NAME ?? "Negocio Demo";
  const adminEmail = (
    process.env.SEED_ADMIN_EMAIL ?? "admin@erp.local"
  ).toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword || adminPassword.length < 8) {
    throw new Error(
      "SEED_ADMIN_PASSWORD debe estar definida en .env con al menos 8 caracteres.",
    );
  }

  // --- 1. Negocio -----------------------------------------------------------
  // Se identifica por nombre para que reejecutar el seed no cree un segundo
  // negocio con los mismos datos.
  const existingBusiness = await db.business.findFirst({
    where: { name: businessName, deletedAt: null },
  });

  const business =
    existingBusiness ??
    (await db.business.create({ data: { name: businessName } }));

  console.log(`  ✓ Negocio: ${business.name}`);

  // --- 2. Configuración -----------------------------------------------------
  await db.businessSettings.upsert({
    where: { businessId: business.id },
    // No se sobrescribe: si el cliente ya cambió el IVA o la zona horaria
    // durante la demo, reejecutar el seed no debe revertir su decisión.
    update: {},
    create: {
      businessId: business.id,
      countryCode: "MX",
      currency: "MXN",
      locale: "es-MX",
      timezone: "America/Mexico_City",
      defaultTaxRateBps: 1600,
      pricesIncludeTax: true,
      allowNegativeStock: false,
      lowStockThreshold: 5000,
    },
  });
  console.log("  ✓ Configuración (MXN, es-MX, IVA 16% incluido)");

  // --- 3. Roles -------------------------------------------------------------
  const roles: Record<string, { id: string }> = {};

  for (const [key, definition] of Object.entries(ROLE_DEFINITIONS)) {
    const role = await db.role.upsert({
      where: { businessId_key: { businessId: business.id, key } },
      // Los permisos SÍ se actualizan: si se añade una capacidad nueva al
      // sistema, el rol debe recibirla al reejecutar el seed.
      update: {
        name: definition.name,
        description: definition.description,
        permissions: [...definition.permissions],
      },
      create: {
        businessId: business.id,
        key,
        name: definition.name,
        description: definition.description,
        permissions: [...definition.permissions],
        isSystem: true,
      },
    });
    roles[key] = role;
  }
  console.log(`  ✓ Roles: ${Object.keys(ROLE_DEFINITIONS).join(", ")}`);

  // --- 4. Usuario administrador --------------------------------------------
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await db.user.upsert({
    where: { businessId_email: { businessId: business.id, email: adminEmail } },
    // La contraseña NO se reescribe si el usuario ya existe: reejecutar el
    // seed no debe restablecer una contraseña que el cliente ya cambió.
    update: {},
    create: {
      businessId: business.id,
      email: adminEmail,
      name: "Administrador",
      passwordHash,
      roleId: roles.ADMIN.id,
    },
  });
  console.log(`  ✓ Usuario administrador: ${admin.email}`);

  // --- 5. Tasas de impuesto -------------------------------------------------
  // Tres filas, no una constante: el requisito 12 pide explícitamente NO
  // asumir que todo lleva 16%.
  const taxRates = [
    { name: "IVA 16%", rateBps: 1600, isExempt: false, isDefault: true },
    { name: "IVA 0%", rateBps: 0, isExempt: false, isDefault: false },
    { name: "Exento", rateBps: 0, isExempt: true, isDefault: false },
  ];

  const taxRateIds: Record<string, string> = {};

  for (const rate of taxRates) {
    const created = await db.taxRate.upsert({
      where: { businessId_name: { businessId: business.id, name: rate.name } },
      update: { rateBps: rate.rateBps, isExempt: rate.isExempt },
      create: { businessId: business.id, ...rate },
    });
    taxRateIds[rate.name] = created.id;
  }
  console.log("  ✓ Tasas de impuesto: IVA 16%, IVA 0%, Exento");

  // --- 6. Métodos de pago ---------------------------------------------------
  const paymentMethods = [
    { code: "CASH", name: "Efectivo", requiresChange: true, sortOrder: 1 },
    { code: "CARD", name: "Tarjeta", requiresChange: false, sortOrder: 2 },
    {
      code: "TRANSFER",
      name: "Transferencia",
      requiresChange: false,
      sortOrder: 3,
    },
    { code: "OTHER", name: "Otro", requiresChange: false, sortOrder: 4 },
  ];

  for (const method of paymentMethods) {
    await db.paymentMethod.upsert({
      where: {
        businessId_code: { businessId: business.id, code: method.code },
      },
      update: { name: method.name, sortOrder: method.sortOrder },
      create: { businessId: business.id, ...method },
    });
  }
  console.log("  ✓ Métodos de pago: Efectivo, Tarjeta, Transferencia, Otro");

  // --- 7. Contadores de folios ---------------------------------------------
  for (const [docType, prefix] of [
    ["SALE", "VTA"],
    ["PURCHASE", "CMP"],
  ] as const) {
    await db.documentCounter.upsert({
      where: { businessId_docType: { businessId: business.id, docType } },
      // El contador NUNCA se reinicia: hacerlo generaría folios duplicados.
      update: {},
      create: { businessId: business.id, docType, prefix, nextValue: 1 },
    });
  }
  console.log("  ✓ Contadores de folios (VTA, CMP)");

  // --- 8. Categorías de gasto ----------------------------------------------
  const expenseCategories = [
    "Renta",
    "Servicios",
    "Nómina",
    "Mantenimiento",
    "Transporte",
    "Otros",
  ];

  for (const name of expenseCategories) {
    await db.expenseCategory.upsert({
      where: { businessId_name: { businessId: business.id, name } },
      update: {},
      create: { businessId: business.id, name },
    });
  }
  console.log(`  ✓ Categorías de gasto (${expenseCategories.length})`);

  if (withDemoData) {
    await seedDemoData(business.id, admin.id, taxRateIds);
  }

  console.log("\n✓ Seed completado.");
  console.log(`\n  Accede con:  ${adminEmail}`);
  console.log(`  Contraseña:  (la de SEED_ADMIN_PASSWORD en tu .env)\n`);

  if (!withDemoData) {
    console.log(
      "  Sugerencia: `npm run db:seed -- --demo` añade catálogo de ejemplo.\n",
    );
  }
}

/**
 * Datos de muestra, solo con `--demo`.
 *
 * Sirven para recorrer el sistema antes de capturar el catálogo real. Los
 * productos llevan existencia inicial creada mediante movimientos de tipo
 * INITIAL, no escribiendo `stock` directamente: incluso el seed respeta la
 * regla de que toda existencia procede de un movimiento registrado.
 */
async function seedDemoData(
  businessId: string,
  userId: string,
  taxRateIds: Record<string, string>,
) {
  console.log("\n→ Sembrando datos de ejemplo…");

  const categories = ["Abarrotes", "Bebidas", "Limpieza", "Papelería"];
  const categoryIds: Record<string, string> = {};

  for (const name of categories) {
    const category = await db.category.upsert({
      where: { businessId_name: { businessId, name } },
      update: {},
      create: { businessId, name },
    });
    categoryIds[name] = category.id;
  }

  const supplier = await db.supplier.findFirst({
    where: { businessId, name: "Distribuidora del Centro", deletedAt: null },
  });

  const proveedor =
    supplier ??
    (await db.supplier.create({
      data: {
        businessId,
        name: "Distribuidora del Centro",
        contact: "Laura Méndez",
        phone: "55 1234 5678",
        email: "ventas@distcentro.mx",
        rfc: "DCE010203AB4",
      },
    }));

  // Precios con IVA incluido, como en el anaquel.
  const products = [
    { sku: "ABA-001", name: "Arroz 1 kg", cat: "Abarrotes", price: 3200, cost: 2400, stock: 40, tax: "IVA 0%" },
    { sku: "ABA-002", name: "Frijol negro 1 kg", cat: "Abarrotes", price: 3800, cost: 2900, stock: 35, tax: "IVA 0%" },
    { sku: "ABA-003", name: "Aceite vegetal 1 L", cat: "Abarrotes", price: 4500, cost: 3500, stock: 24, tax: "IVA 0%" },
    { sku: "ABA-004", name: "Azúcar 1 kg", cat: "Abarrotes", price: 2900, cost: 2200, stock: 30, tax: "IVA 0%" },
    { sku: "BEB-001", name: "Refresco cola 600 ml", cat: "Bebidas", price: 2200, cost: 1500, stock: 60, tax: "IVA 16%" },
    { sku: "BEB-002", name: "Agua natural 1 L", cat: "Bebidas", price: 1500, cost: 900, stock: 80, tax: "IVA 0%" },
    { sku: "BEB-003", name: "Jugo de naranja 1 L", cat: "Bebidas", price: 3400, cost: 2500, stock: 18, tax: "IVA 0%" },
    { sku: "LIM-001", name: "Detergente en polvo 1 kg", cat: "Limpieza", price: 5600, cost: 4200, stock: 22, tax: "IVA 16%" },
    { sku: "LIM-002", name: "Jabón de barra", cat: "Limpieza", price: 1800, cost: 1200, stock: 45, tax: "IVA 16%" },
    { sku: "LIM-003", name: "Cloro 1 L", cat: "Limpieza", price: 2600, cost: 1800, stock: 4, tax: "IVA 16%" },
    { sku: "PAP-001", name: "Cuaderno profesional", cat: "Papelería", price: 4200, cost: 3000, stock: 15, tax: "IVA 16%" },
    { sku: "PAP-002", name: "Paquete de bolígrafos", cat: "Papelería", price: 3500, cost: 2400, stock: 3, tax: "IVA 16%" },
  ];

  for (const item of products) {
    const existing = await db.product.findUnique({
      where: { businessId_sku: { businessId, sku: item.sku } },
    });

    if (existing) continue;

    // Producto y existencia inicial en una transacción: nunca debe quedar un
    // producto con stock pero sin el movimiento que lo justifica.
    await db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          businessId,
          sku: item.sku,
          name: item.name,
          categoryId: categoryIds[item.cat],
          supplierId: proveedor.id,
          taxRateId: taxRateIds[item.tax],
          priceCents: item.price,
          costCents: item.cost,
          stock: item.stock * 1000,
          minStock: 5000,
          unit: "PIECE",
        },
      });

      await tx.inventoryMovement.create({
        data: {
          businessId,
          productId: product.id,
          type: "INITIAL",
          quantityDelta: item.stock * 1000,
          balanceAfter: item.stock * 1000,
          unitCostCents: item.cost,
          reason: "Existencia inicial (datos de ejemplo)",
          userId,
        },
      });
    });
  }

  const customers = [
    { name: "Público en general", phone: null, rfc: "XAXX010101000" },
    { name: "María González", phone: "55 9876 5432", rfc: null },
    { name: "Comercializadora Ríos SA de CV", phone: "55 5555 1122", rfc: "CRI950812H23" },
  ];

  for (const customer of customers) {
    const exists = await db.customer.findFirst({
      where: { businessId, name: customer.name, deletedAt: null },
    });
    if (!exists) {
      await db.customer.create({ data: { businessId, ...customer } });
    }
  }

  console.log(
    `  ✓ ${products.length} productos, ${categories.length} categorías, 1 proveedor, ${customers.length} clientes`,
  );
}

main()
  .catch((error) => {
    console.error("\n✗ El seed falló:\n", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
