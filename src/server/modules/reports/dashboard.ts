import { TZDate } from "@date-fns/tz";
import { endOfDay, endOfMonth, startOfDay, startOfMonth, subDays } from "date-fns";

import { type RequestContext, requirePermission } from "@/server/core/context";
import { db } from "@/server/core/db";
import { NotFoundError } from "@/server/core/errors";
import { PERMISSIONS } from "@/server/core/permissions";

/**
 * MÉTRICAS DEL PANEL
 * ===========================================================================
 * Criterio de diseño (requisito 4): cada cifra responde una pregunta concreta
 * que el dueño del negocio se hace de verdad. No se incluye nada solo porque
 * sea calculable.
 *
 *   ventas de hoy      -> ¿cómo va el día?
 *   ventas del mes     -> ¿vamos bien contra el mes pasado?
 *   gastos del mes     -> ¿en qué se está yendo el dinero?
 *   ganancia estimada  -> ¿estoy ganando dinero de verdad?
 *   stock bajo         -> ¿qué tengo que pedir HOY?
 *   últimas ventas     -> ¿qué está pasando ahora mismo en la caja?
 *
 * Deliberadamente NO se incluyen: gráficas de tendencia a 12 meses (no hay
 * datos aún), medidores de porcentaje sin referencia, ni "productos más
 * vistos". Un panel lleno de gráficas bonitas que nadie usa es ruido.
 *
 * SOBRE LAS FECHAS: los cortes de día y mes se calculan en la ZONA HORARIA DEL
 * NEGOCIO, no en UTC. Si no, en México el "día" terminaría a las 6 de la tarde
 * y el corte de caja nunca cuadraría.
 */

export interface DashboardMetrics {
  today: {
    salesCount: number;
    revenueCents: number;
    /** Comparación con el mismo periodo de ayer. */
    changeVsYesterdayBps: number | null;
  };
  month: {
    salesCount: number;
    revenueCents: number;
    expensesCents: number;
    /** Ingresos menos costo de lo vendido menos gastos. */
    estimatedProfitCents: number;
    /** Margen bruto: (ingreso - costo) / ingreso, en basis points. */
    grossMarginBps: number | null;
  };
  lowStock: {
    count: number;
    items: {
      id: string;
      name: string;
      sku: string;
      stock: number;
      minStock: number | null;
      unit: string;
    }[];
  };
  recentSales: {
    id: string;
    folio: string;
    totalCents: number;
    createdAt: Date;
    status: string;
    customerName: string | null;
    userName: string;
    itemCount: number;
  }[];
  recentActivity: {
    id: string;
    action: string;
    entityType: string;
    userName: string | null;
    createdAt: Date;
    metadata: unknown;
  }[];
}

export async function getDashboard(
  ctx: RequestContext,
): Promise<DashboardMetrics> {
  requirePermission(ctx, PERMISSIONS.SALES_READ);

  const settings = await db.businessSettings.findUnique({
    where: { businessId: ctx.businessId },
    select: { timezone: true, lowStockThreshold: true },
  });

  if (!settings) throw new NotFoundError("La configuración del negocio");

  // Los límites del día y del mes se calculan en la zona del negocio y luego
  // se convierten a instantes absolutos para consultar Postgres, que almacena
  // en UTC.
  const now = new TZDate(new Date(), settings.timezone);

  const todayStart = new Date(startOfDay(now).getTime());
  const todayEnd = new Date(endOfDay(now).getTime());
  const yesterdayStart = new Date(startOfDay(subDays(now, 1)).getTime());
  const yesterdayEnd = new Date(endOfDay(subDays(now, 1)).getTime());
  const monthStart = new Date(startOfMonth(now).getTime());
  const monthEnd = new Date(endOfMonth(now).getTime());

  // Las ventas CANCELADAS se excluyen de todas las cifras: cobrar y luego
  // cancelar no puede seguir contando como ingreso.
  const completedSale = { status: "COMPLETED" as const };

  const [
    todayAgg,
    yesterdayAgg,
    monthAgg,
    monthCostAgg,
    monthExpensesAgg,
    lowStockItems,
    lowStockCount,
    recentSales,
    recentActivity,
  ] = await Promise.all([
    db.sale.aggregate({
      where: {
        businessId: ctx.businessId,
        ...completedSale,
        createdAt: { gte: todayStart, lte: todayEnd },
      },
      _sum: { totalCents: true },
      _count: true,
    }),

    db.sale.aggregate({
      where: {
        businessId: ctx.businessId,
        ...completedSale,
        createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
      },
      _sum: { totalCents: true },
    }),

    db.sale.aggregate({
      where: {
        businessId: ctx.businessId,
        ...completedSale,
        createdAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { totalCents: true, subtotalCents: true },
      _count: true,
    }),

    /*
     * Costo de lo vendido.
     *
     * Debe ser SUMA(cantidad × costo unitario), no SUMA(costo unitario). Esto
     * NO se puede expresar con `aggregate` de Prisma, que solo suma columnas
     * tal cual: sumar `unitCostCents` daría el costo de UNA pieza por línea e
     * inflaría el margen de forma grosera.
     *
     * La cantidad está en mili-unidades, de ahí la división entre 1000. Se
     * redondea a centavo al final, coherente con `lineAmountCents`.
     *
     * Se usa el costo CONGELADO en cada línea al momento de la venta, no el
     * costo actual del producto: si el proveedor subió precios después, el
     * margen histórico no debe cambiar retroactivamente.
     */
    db.$queryRaw<{ cost: number | null }[]>`
      SELECT COALESCE(
        SUM(ROUND(si.quantity::numeric * si."unitCostCents" / 1000)),
        0
      )::bigint AS cost
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      WHERE s."businessId" = ${ctx.businessId}
        AND s.status = 'COMPLETED'
        AND s."createdAt" >= ${monthStart}
        AND s."createdAt" <= ${monthEnd}
    `,

    db.expense.aggregate({
      where: {
        businessId: ctx.businessId,
        deletedAt: null,
        spentAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amountCents: true },
    }),

    db.product.findMany({
      where: {
        businessId: ctx.businessId,
        deletedAt: null,
        status: "ACTIVE",
        tracksInventory: true,
        OR: [
          { minStock: null, stock: { lte: settings.lowStockThreshold } },
          { stock: { lte: db.product.fields.minStock } },
        ],
      },
      select: {
        id: true,
        name: true,
        sku: true,
        stock: true,
        minStock: true,
        unit: true,
      },
      orderBy: { stock: "asc" },
      take: 8,
    }),

    db.product.count({
      where: {
        businessId: ctx.businessId,
        deletedAt: null,
        status: "ACTIVE",
        tracksInventory: true,
        OR: [
          { minStock: null, stock: { lte: settings.lowStockThreshold } },
          { stock: { lte: db.product.fields.minStock } },
        ],
      },
    }),

    db.sale.findMany({
      where: { businessId: ctx.businessId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        folio: true,
        totalCents: true,
        createdAt: true,
        status: true,
        customer: { select: { name: true } },
        user: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),

    db.auditLog.findMany({
      where: { businessId: ctx.businessId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        action: true,
        entityType: true,
        userName: true,
        createdAt: true,
        metadata: true,
      },
    }),
  ]);

  const todayRevenue = todayAgg._sum.totalCents ?? 0;
  const yesterdayRevenue = yesterdayAgg._sum.totalCents ?? 0;

  // La variación solo tiene sentido si ayer hubo ventas: dividir entre cero
  // produciría "+∞ %", que no informa de nada.
  const changeVsYesterdayBps =
    yesterdayRevenue > 0
      ? Math.round(
          ((todayRevenue - yesterdayRevenue) * 10_000) / yesterdayRevenue,
        )
      : null;

  const monthRevenue = monthAgg._sum.totalCents ?? 0;
  const monthSubtotal = monthAgg._sum.subtotalCents ?? 0;
  // `SUM` sobre bigint llega como BigInt; se convierte a número (seguro hasta
  // 9×10¹⁵ centavos, muy por encima de cualquier cifra real).
  const monthCost = Number(monthCostAgg[0]?.cost ?? 0);
  const monthExpenses = monthExpensesAgg._sum.amountCents ?? 0;

  // Ganancia ESTIMADA, y se llama así a propósito: es una aproximación de
  // gestión, no un resultado contable. No considera devoluciones parciales ni
  // depreciación.
  const estimatedProfitCents = monthSubtotal - monthCost - monthExpenses;

  const grossMarginBps =
    monthSubtotal > 0
      ? Math.round(((monthSubtotal - monthCost) * 10_000) / monthSubtotal)
      : null;

  return {
    today: {
      salesCount: todayAgg._count,
      revenueCents: todayRevenue,
      changeVsYesterdayBps,
    },
    month: {
      salesCount: monthAgg._count,
      revenueCents: monthRevenue,
      expensesCents: monthExpenses,
      estimatedProfitCents,
      grossMarginBps,
    },
    lowStock: {
      count: lowStockCount,
      items: lowStockItems,
    },
    recentSales: recentSales.map((sale) => ({
      id: sale.id,
      folio: sale.folio,
      totalCents: sale.totalCents,
      createdAt: sale.createdAt,
      status: sale.status,
      customerName: sale.customer?.name ?? null,
      userName: sale.user.name,
      itemCount: sale._count.items,
    })),
    recentActivity,
  };
}
