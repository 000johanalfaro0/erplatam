import { TZDate } from "@date-fns/tz";
import { endOfDay, startOfDay } from "date-fns";
import { z } from "zod";

import { type RequestContext, requirePermission } from "@/server/core/context";
import { db } from "@/server/core/db";
import { NotFoundError } from "@/server/core/errors";
import { PERMISSIONS } from "@/server/core/permissions";

/**
 * REPORTES (requisito 11)
 * ===========================================================================
 * Todas las agregaciones se hacen en SQL, no trayendo filas a memoria para
 * sumarlas en JavaScript. Con 200 ventas da igual; con 50.000 es la diferencia
 * entre un reporte instantáneo y uno que tumba el servidor.
 *
 * SOBRE LAS FECHAS — el detalle que rompe los reportes diarios:
 * los cortes se calculan en la ZONA HORARIA DEL NEGOCIO y luego se convierten
 * a instantes absolutos. Postgres almacena en UTC; si se agrupara por
 * `date_trunc('day', "createdAt")` sin convertir, en México el día terminaría
 * a las 18:00 y las ventas de la tarde se contarían en el día siguiente.
 */

export const reportRangeSchema = z.object({
  /** Fecha inicial inclusive, en formato YYYY-MM-DD. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  /** Fecha final inclusive. */
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  /** Granularidad de agrupación temporal. */
  granularity: z.enum(["day", "week", "month"]).default("day"),
});

export type ReportRange = z.infer<typeof reportRangeSchema>;

async function getTimezone(businessId: string): Promise<string> {
  const settings = await db.businessSettings.findUnique({
    where: { businessId },
    select: { timezone: true },
  });
  if (!settings) throw new NotFoundError("La configuración del negocio");
  return settings.timezone;
}

/**
 * Convierte una columna de fecha a la hora local del negocio, dentro de SQL.
 *
 * ⚠️ LA DOBLE CONVERSIÓN NO ES UN ERROR — ES OBLIGATORIA.
 *
 * Prisma mapea `DateTime` a `timestamp WITHOUT time zone`, y guarda ahí
 * valores en UTC. Postgres NO sabe que son UTC: para él son fechas "desnudas".
 *
 * Por eso hacen falta dos pasos:
 *
 *   columna AT TIME ZONE 'UTC'          → "esta fecha desnuda es UTC"
 *                                          (produce un timestamptz real)
 *   ... AT TIME ZONE 'America/Mexico_City' → "dámela en hora de México"
 *
 * Escribir solo el segundo paso —el error que tenía este archivo— hace que
 * Postgres interprete el valor como si YA fuera hora de México y lo convierta
 * a UTC: desplaza +6 horas en lugar de −6. Un error de 12 horas que hace que
 * las ventas de la noche aparezcan en el día siguiente y que ningún corte de
 * caja cuadre.
 *
 * Se centraliza aquí para que ninguna consulta futura tenga que acordarse.
 * `tests/integration/reports-timezone.test.ts` verifica que no vuelva a
 * romperse.
 *
 * MEJORA FUTURA (documentada en docs/decisions.md): migrar las columnas a
 * `timestamptz` con `@db.Timestamptz(3)` haría innecesaria la primera
 * conversión. No se hace ahora porque `ALTER COLUMN TYPE` interpreta los
 * valores existentes según la zona de la sesión, y hacerlo con datos reales de
 * demo en marcha podría desplazarlos.
 */
function localTime(column: string): string {
  return `${column} AT TIME ZONE 'UTC' AT TIME ZONE $1`;
}

/** Convierte YYYY-MM-DD en la zona del negocio a instantes UTC. */
function toRange(range: ReportRange, timezone: string) {
  const from = new Date(
    startOfDay(new TZDate(`${range.from}T12:00:00`, timezone)).getTime(),
  );
  const to = new Date(
    endOfDay(new TZDate(`${range.to}T12:00:00`, timezone)).getTime(),
  );
  return { from, to };
}

// ---------------------------------------------------------------------------
// Ventas por periodo
// ---------------------------------------------------------------------------

export interface SalesByPeriodRow {
  period: string;
  salesCount: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  costCents: number;
  profitCents: number;
}

/**
 * Ventas agrupadas por día, semana o mes.
 *
 * Incluye el costo de lo vendido y la utilidad bruta, calculados con el costo
 * CONGELADO en cada línea al momento de la venta. Si el proveedor subió
 * precios después, el margen histórico no cambia retroactivamente.
 */
export async function salesByPeriod(
  ctx: RequestContext,
  range: ReportRange,
): Promise<SalesByPeriodRow[]> {
  requirePermission(ctx, PERMISSIONS.REPORTS_READ);

  const timezone = await getTimezone(ctx.businessId);
  const { from, to } = toRange(range, timezone);

  /*
   * `localTime()` convierte el instante a hora del negocio antes de truncar,
   * que es lo que hace que "el día" sea el día del negocio y no el de
   * Greenwich. Ver su comentario: la doble conversión es obligatoria.
   *
   * La granularidad se interpola directamente en el SQL, pero NO es inyectable:
   * Zod ya la restringió a 'day' | 'week' | 'month' antes de llegar aquí.
   */
  const granularity = range.granularity;

  const rows = await db.$queryRawUnsafe<
    {
      period: Date;
      sales_count: bigint;
      subtotal: bigint;
      tax: bigint;
      total: bigint;
      cost: bigint;
    }[]
  >(
    `
    SELECT
      date_trunc('${granularity}', ${localTime('s."createdAt"')}) AS period,
      COUNT(DISTINCT s.id)                                         AS sales_count,
      COALESCE(SUM(si."subtotalCents"), 0)                         AS subtotal,
      COALESCE(SUM(si."taxCents"), 0)                              AS tax,
      COALESCE(SUM(si."totalCents"), 0)                            AS total,
      COALESCE(SUM(ROUND(si.quantity::numeric * si."unitCostCents" / 1000)), 0) AS cost
    FROM "Sale" s
    JOIN "SaleItem" si ON si."saleId" = s.id
    WHERE s."businessId" = $2
      AND s.status = 'COMPLETED'
      AND s."createdAt" >= $3
      AND s."createdAt" <= $4
    GROUP BY period
    ORDER BY period ASC
    `,
    timezone,
    ctx.businessId,
    from,
    to,
  );

  return rows.map((row) => {
    const subtotalCents = Number(row.subtotal);
    const costCents = Number(row.cost);

    return {
      period: row.period.toISOString().slice(0, 10),
      salesCount: Number(row.sales_count),
      subtotalCents,
      taxCents: Number(row.tax),
      totalCents: Number(row.total),
      costCents,
      // Utilidad BRUTA: no descuenta gastos. Esos van en su propio reporte.
      profitCents: subtotalCents - costCents,
    };
  });
}

// ---------------------------------------------------------------------------
// Productos vendidos
// ---------------------------------------------------------------------------

export interface ProductSoldRow {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  quantitySold: number;
  revenueCents: number;
  costCents: number;
  profitCents: number;
  marginBps: number | null;
}

/**
 * Ranking de productos vendidos.
 *
 * Ordenado por utilidad, no por unidades ni por ingreso. Es la ordenación que
 * responde la pregunta que importa: "¿qué me da dinero de verdad?". Un
 * producto puede vender muchísimo y aportar casi nada de margen.
 */
export async function productsSold(
  ctx: RequestContext,
  range: ReportRange,
  limit = 100,
): Promise<ProductSoldRow[]> {
  requirePermission(ctx, PERMISSIONS.REPORTS_READ);

  const timezone = await getTimezone(ctx.businessId);
  const { from, to } = toRange(range, timezone);

  const rows = await db.$queryRaw<
    {
      productId: string;
      sku: string;
      name: string;
      unit: string;
      quantity: bigint;
      revenue: bigint;
      cost: bigint;
    }[]
  >`
    SELECT
      si."productId",
      si."productSku"  AS sku,
      si."productName" AS name,
      p.unit,
      COALESCE(SUM(si.quantity), 0)        AS quantity,
      COALESCE(SUM(si."subtotalCents"), 0) AS revenue,
      COALESCE(SUM(ROUND(si.quantity::numeric * si."unitCostCents" / 1000)), 0) AS cost
    FROM "SaleItem" si
    JOIN "Sale" s ON s.id = si."saleId"
    JOIN "Product" p ON p.id = si."productId"
    WHERE s."businessId" = ${ctx.businessId}
      AND s.status = 'COMPLETED'
      AND s."createdAt" >= ${from}
      AND s."createdAt" <= ${to}
    GROUP BY si."productId", si."productSku", si."productName", p.unit
    ORDER BY (COALESCE(SUM(si."subtotalCents"), 0)
              - COALESCE(SUM(ROUND(si.quantity::numeric * si."unitCostCents" / 1000)), 0)) DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => {
    const revenueCents = Number(row.revenue);
    const costCents = Number(row.cost);
    const profitCents = revenueCents - costCents;

    return {
      productId: row.productId,
      sku: row.sku,
      name: row.name,
      unit: row.unit,
      quantitySold: Number(row.quantity),
      revenueCents,
      costCents,
      profitCents,
      marginBps:
        revenueCents > 0
          ? Math.round((profitCents * 10_000) / revenueCents)
          : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Gastos por categoría
// ---------------------------------------------------------------------------

export interface ExpenseByCategoryRow {
  categoryId: string | null;
  categoryName: string;
  count: number;
  totalCents: number;
  /** Porcentaje del total del periodo, en basis points. */
  shareBps: number;
}

export async function expensesByCategory(
  ctx: RequestContext,
  range: ReportRange,
): Promise<ExpenseByCategoryRow[]> {
  requirePermission(ctx, PERMISSIONS.REPORTS_READ);

  const timezone = await getTimezone(ctx.businessId);
  const { from, to } = toRange(range, timezone);

  const grouped = await db.expense.groupBy({
    by: ["categoryId"],
    where: {
      businessId: ctx.businessId,
      deletedAt: null,
      spentAt: { gte: from, lte: to },
    },
    _sum: { amountCents: true },
    _count: true,
  });

  const categories = await db.expenseCategory.findMany({
    where: { businessId: ctx.businessId },
    select: { id: true, name: true },
  });
  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  const total = grouped.reduce(
    (sum, row) => sum + (row._sum.amountCents ?? 0),
    0,
  );

  return grouped
    .map((row) => {
      const totalCents = row._sum.amountCents ?? 0;
      return {
        categoryId: row.categoryId,
        categoryName: row.categoryId
          ? (nameById.get(row.categoryId) ?? "Categoría eliminada")
          : "Sin categoría",
        count: row._count,
        totalCents,
        shareBps: total > 0 ? Math.round((totalCents * 10_000) / total) : 0,
      };
    })
    .sort((a, b) => b.totalCents - a.totalCents);
}

// ---------------------------------------------------------------------------
// Valor del inventario
// ---------------------------------------------------------------------------

export interface InventoryValueRow {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  stock: number;
  costCents: number;
  priceCents: number;
  /** Lo que costó la mercancía en almacén. */
  stockCostCents: number;
  /** Lo que valdría vendida. */
  stockRetailCents: number;
  isLowStock: boolean;
}

/**
 * Valor del inventario.
 *
 * Responde "¿cuánto dinero tengo parado en el almacén?", que suele ser la
 * cifra más grande del negocio y la que nadie conoce.
 *
 * Se dan dos valuaciones: a costo (lo que se pagó, la cifra contable) y a
 * precio de venta (lo que se recuperaría vendiéndolo todo).
 */
export async function inventoryValue(
  ctx: RequestContext,
): Promise<{ rows: InventoryValueRow[]; totalCostCents: number; totalRetailCents: number }> {
  requirePermission(ctx, PERMISSIONS.REPORTS_READ);

  const settings = await db.businessSettings.findUnique({
    where: { businessId: ctx.businessId },
    select: { lowStockThreshold: true },
  });

  const products = await db.product.findMany({
    where: {
      businessId: ctx.businessId,
      deletedAt: null,
      tracksInventory: true,
    },
    select: {
      id: true,
      sku: true,
      name: true,
      unit: true,
      stock: true,
      minStock: true,
      costCents: true,
      priceCents: true,
    },
    orderBy: { name: "asc" },
  });

  const threshold = settings?.lowStockThreshold ?? 0;

  const rows = products.map((product) => {
    // La existencia está en mili-unidades: hay que dividir entre 1000 para
    // multiplicar por el precio unitario.
    const stockCostCents = Math.round(
      (product.stock * product.costCents) / 1000,
    );
    const stockRetailCents = Math.round(
      (product.stock * product.priceCents) / 1000,
    );

    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      stock: product.stock,
      costCents: product.costCents,
      priceCents: product.priceCents,
      stockCostCents,
      stockRetailCents,
      isLowStock: product.stock <= (product.minStock ?? threshold),
    };
  });

  return {
    rows,
    totalCostCents: rows.reduce((sum, row) => sum + row.stockCostCents, 0),
    totalRetailCents: rows.reduce((sum, row) => sum + row.stockRetailCents, 0),
  };
}

// ---------------------------------------------------------------------------
// Resumen del periodo
// ---------------------------------------------------------------------------

/**
 * Estado de resultados simplificado del periodo.
 *
 * Se llama "estimado" a propósito: no es contabilidad formal. No considera
 * depreciación, devoluciones parciales ni provisiones. Responde bien a
 * "¿gané dinero este mes?", que es lo que el dueño necesita saber.
 */
export async function periodSummary(ctx: RequestContext, range: ReportRange) {
  requirePermission(ctx, PERMISSIONS.REPORTS_READ);

  const timezone = await getTimezone(ctx.businessId);
  const { from, to } = toRange(range, timezone);

  const [salesAgg, costRow, expensesAgg, voidedAgg] = await Promise.all([
    db.sale.aggregate({
      where: {
        businessId: ctx.businessId,
        status: "COMPLETED",
        createdAt: { gte: from, lte: to },
      },
      _sum: { subtotalCents: true, taxCents: true, totalCents: true },
      _count: true,
      _avg: { totalCents: true },
    }),
    db.$queryRaw<{ cost: bigint }[]>`
      SELECT COALESCE(SUM(ROUND(si.quantity::numeric * si."unitCostCents" / 1000)), 0)::bigint AS cost
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      WHERE s."businessId" = ${ctx.businessId}
        AND s.status = 'COMPLETED'
        AND s."createdAt" >= ${from}
        AND s."createdAt" <= ${to}
    `,
    db.expense.aggregate({
      where: {
        businessId: ctx.businessId,
        deletedAt: null,
        spentAt: { gte: from, lte: to },
      },
      _sum: { amountCents: true },
      _count: true,
    }),
    // Las ventas canceladas se reportan aparte: un número alto de
    // cancelaciones es una señal que el dueño debe ver, no esconderse.
    db.sale.aggregate({
      where: {
        businessId: ctx.businessId,
        status: "VOIDED",
        createdAt: { gte: from, lte: to },
      },
      _sum: { totalCents: true },
      _count: true,
    }),
  ]);

  const revenueCents = salesAgg._sum.subtotalCents ?? 0;
  const costCents = Number(costRow[0]?.cost ?? 0);
  const expensesCents = expensesAgg._sum.amountCents ?? 0;
  const grossProfitCents = revenueCents - costCents;

  return {
    range: { from: range.from, to: range.to },
    sales: {
      count: salesAgg._count,
      /** Ingreso sin impuesto: el impuesto no es del negocio, es del SAT. */
      revenueCents,
      taxCollectedCents: salesAgg._sum.taxCents ?? 0,
      grossCents: salesAgg._sum.totalCents ?? 0,
      averageTicketCents: Math.round(salesAgg._avg.totalCents ?? 0),
    },
    costs: {
      costOfGoodsSoldCents: costCents,
      grossProfitCents,
      grossMarginBps:
        revenueCents > 0
          ? Math.round((grossProfitCents * 10_000) / revenueCents)
          : null,
    },
    expenses: {
      count: expensesAgg._count,
      totalCents: expensesCents,
    },
    result: {
      netProfitCents: grossProfitCents - expensesCents,
      netMarginBps:
        revenueCents > 0
          ? Math.round(
              ((grossProfitCents - expensesCents) * 10_000) / revenueCents,
            )
          : null,
    },
    voided: {
      count: voidedAgg._count,
      totalCents: voidedAgg._sum.totalCents ?? 0,
    },
  };
}
