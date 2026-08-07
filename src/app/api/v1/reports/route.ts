import { z } from "zod";

import {
  csvMoney,
  csvPercent,
  csvQuantity,
  csvResponse,
  toCsv,
} from "@/server/core/csv";
import { requireContext } from "@/server/http/context";
import { RATE_LIMITS, consumeRateLimit } from "@/server/http/rate-limit";
import { ok, route } from "@/server/http/response";
import {
  expensesByCategory,
  inventoryValue,
  periodSummary,
  productsSold,
  reportRangeSchema,
  salesByPeriod,
} from "@/server/modules/reports";

/**
 * GET /api/v1/reports?type=...&from=...&to=...&format=json|csv
 *
 * Un único endpoint para todos los reportes, con `type` eligiendo cuál. La
 * alternativa —seis rutas casi idénticas— duplicaría el manejo de rango de
 * fechas, permisos y exportación en cada una.
 *
 * `format=csv` devuelve el mismo dato como descarga. La conversión ocurre
 * aquí, en la capa HTTP, y no en el módulo de reportes: el dominio produce
 * datos, el transporte decide cómo se entregan.
 */
const querySchema = z.object({
  type: z.enum([
    "sales",
    "products",
    "expenses",
    "inventory",
    "summary",
  ]),
  format: z.enum(["json", "csv"]).default("json"),
});

export const GET = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const { type, format } = querySchema.parse(params);

  // El inventario es una foto del momento: no admite rango de fechas.
  if (type === "inventory") {
    const data = await inventoryValue(ctx);

    if (format === "csv") {
      return csvResponse(
        toCsv(data.rows, [
          { header: "SKU", value: (r) => r.sku },
          { header: "Producto", value: (r) => r.name },
          { header: "Existencia", value: (r) => csvQuantity(r.stock) },
          { header: "Unidad", value: (r) => r.unit },
          { header: "Costo unitario", value: (r) => csvMoney(r.costCents) },
          { header: "Precio unitario", value: (r) => csvMoney(r.priceCents) },
          { header: "Valor a costo", value: (r) => csvMoney(r.stockCostCents) },
          { header: "Valor a venta", value: (r) => csvMoney(r.stockRetailCents) },
          { header: "Stock bajo", value: (r) => r.isLowStock },
        ]),
        `inventario-${today()}.csv`,
      );
    }

    return ok(data);
  }

  const range = reportRangeSchema.parse(params);

  switch (type) {
    case "sales": {
      const rows = await salesByPeriod(ctx, range);

      if (format === "csv") {
        return csvResponse(
          toCsv(rows, [
            { header: "Periodo", value: (r) => r.period },
            { header: "Ventas", value: (r) => r.salesCount },
            { header: "Subtotal", value: (r) => csvMoney(r.subtotalCents) },
            { header: "Impuestos", value: (r) => csvMoney(r.taxCents) },
            { header: "Total", value: (r) => csvMoney(r.totalCents) },
            { header: "Costo de venta", value: (r) => csvMoney(r.costCents) },
            { header: "Utilidad bruta", value: (r) => csvMoney(r.profitCents) },
          ]),
          `ventas-${range.from}-a-${range.to}.csv`,
        );
      }

      return ok(rows);
    }

    case "products": {
      const rows = await productsSold(ctx, range);

      if (format === "csv") {
        return csvResponse(
          toCsv(rows, [
            { header: "SKU", value: (r) => r.sku },
            { header: "Producto", value: (r) => r.name },
            { header: "Cantidad vendida", value: (r) => csvQuantity(r.quantitySold) },
            { header: "Unidad", value: (r) => r.unit },
            { header: "Ingreso", value: (r) => csvMoney(r.revenueCents) },
            { header: "Costo", value: (r) => csvMoney(r.costCents) },
            { header: "Utilidad", value: (r) => csvMoney(r.profitCents) },
            { header: "Margen %", value: (r) => csvPercent(r.marginBps) },
          ]),
          `productos-vendidos-${range.from}-a-${range.to}.csv`,
        );
      }

      return ok(rows);
    }

    case "expenses": {
      const rows = await expensesByCategory(ctx, range);

      if (format === "csv") {
        return csvResponse(
          toCsv(rows, [
            { header: "Categoría", value: (r) => r.categoryName },
            { header: "Movimientos", value: (r) => r.count },
            { header: "Total", value: (r) => csvMoney(r.totalCents) },
            { header: "Participación %", value: (r) => csvPercent(r.shareBps) },
          ]),
          `gastos-${range.from}-a-${range.to}.csv`,
        );
      }

      return ok(rows);
    }

    case "summary":
      return ok(await periodSummary(ctx, range));
  }
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
