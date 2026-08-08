import { z } from "zod";

import {
  csvMoney,
  csvPercent,
  csvQuantity,
  csvResponse,
  toCsv,
} from "@/server/core/csv";
import {
  aPesos,
  aUnidades,
  construirExcel,
  respuestaExcel,
  type ColumnaExcel,
} from "@/server/core/excel";
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
 * GET /api/v1/reports?type=...&from=...&to=...&format=json|csv|xlsx
 *
 * Un único endpoint para todos los reportes, con `type` eligiendo cuál. La
 * alternativa —seis rutas casi idénticas— duplicaría el manejo de rango de
 * fechas, permisos y exportación en cada una.
 *
 * TRES FORMATOS Y PARA QUÉ SIRVE CADA UNO:
 *
 *   json  la pantalla.
 *   xlsx  lo que se descarga desde el botón. Números que suman, fechas que
 *         son fechas, encabezado congelado y fila de totales con fórmula.
 *   csv   se conserva para quien lo quiera meter en otro sistema. El botón
 *         de la pantalla ya no lo usa: decía "Exportar a Excel" y descargaba
 *         un CSV, que se abre en Excel pero llega sin formato, con los
 *         importes como texto y las fechas interpretadas según el idioma del
 *         equipo. Prometía una cosa y entregaba otra.
 *
 * La conversión ocurre aquí, en la capa HTTP, y no en el módulo de reportes:
 * el dominio produce datos, el transporte decide cómo se entregan.
 */
const querySchema = z.object({
  type: z.enum(["sales", "products", "expenses", "inventory", "summary"]),
  format: z.enum(["json", "csv", "xlsx"]).default("json"),
});

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function generado(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural} · generado el ${new Date().toLocaleString("es-MX")}`;
}

export const GET = route(async (request: Request) => {
  const ctx = await requireContext();
  consumeRateLimit(`read:${ctx.userId}`, RATE_LIMITS.read);

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const { type, format } = querySchema.parse(params);

  // El inventario es una foto del momento: no admite rango de fechas.
  if (type === "inventory") {
    const data = await inventoryValue(ctx);
    type Fila = (typeof data.rows)[number];

    if (format === "xlsx") {
      const columnas: ColumnaExcel<Fila>[] = [
        { titulo: "SKU", valor: (r) => r.sku, ancho: 14 },
        { titulo: "Producto", valor: (r) => r.name },
        {
          titulo: "Existencia",
          tipo: "cantidad",
          valor: (r) => aUnidades(r.stock),
          ancho: 12,
        },
        { titulo: "Unidad", valor: (r) => r.unit, ancho: 10 },
        {
          titulo: "Costo unitario",
          tipo: "dinero",
          valor: (r) => aPesos(r.costCents),
          ancho: 14,
        },
        {
          titulo: "Precio unitario",
          tipo: "dinero",
          valor: (r) => aPesos(r.priceCents),
          ancho: 14,
        },
        {
          titulo: "Valor a costo",
          tipo: "dinero",
          valor: (r) => aPesos(r.stockCostCents),
          totaliza: true,
          ancho: 15,
        },
        {
          titulo: "Valor a venta",
          tipo: "dinero",
          valor: (r) => aPesos(r.stockRetailCents),
          totaliza: true,
          ancho: 15,
        },
        {
          titulo: "Stock bajo",
          valor: (r) => (r.isLowStock ? "Sí" : ""),
          ancho: 11,
        },
      ];

      return respuestaExcel(
        await construirExcel<Fila>({
          hoja: "Inventario",
          titulo: "Valor del inventario",
          subtitulo: generado(data.rows.length, "producto", "productos"),
          columnas,
          filas: data.rows,
        }),
        `inventario-${hoy()}`,
      );
    }

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
        `inventario-${hoy()}.csv`,
      );
    }

    return ok(data);
  }

  const range = reportRangeSchema.parse(params);
  const periodo = `del ${range.from} al ${range.to}`;

  switch (type) {
    case "sales": {
      const rows = await salesByPeriod(ctx, range);
      type Fila = (typeof rows)[number];

      if (format === "xlsx") {
        const columnas: ColumnaExcel<Fila>[] = [
          { titulo: "Periodo", valor: (r) => r.period, ancho: 14 },
          {
            titulo: "Ventas",
            tipo: "entero",
            valor: (r) => r.salesCount,
            totaliza: true,
            ancho: 10,
          },
          {
            titulo: "Subtotal",
            tipo: "dinero",
            valor: (r) => aPesos(r.subtotalCents),
            totaliza: true,
            ancho: 14,
          },
          {
            titulo: "Impuestos",
            tipo: "dinero",
            valor: (r) => aPesos(r.taxCents),
            totaliza: true,
            ancho: 14,
          },
          {
            titulo: "Total",
            tipo: "dinero",
            valor: (r) => aPesos(r.totalCents),
            totaliza: true,
            ancho: 14,
          },
          {
            titulo: "Costo de venta",
            tipo: "dinero",
            valor: (r) => aPesos(r.costCents),
            totaliza: true,
            ancho: 15,
          },
          {
            titulo: "Utilidad bruta",
            tipo: "dinero",
            valor: (r) => aPesos(r.profitCents),
            totaliza: true,
            ancho: 15,
          },
        ];

        return respuestaExcel(
          await construirExcel<Fila>({
            hoja: "Ventas",
            titulo: "Ventas por periodo",
            subtitulo: `${periodo} · ${generado(rows.length, "periodo", "periodos")}`,
            columnas,
            filas: rows,
          }),
          `ventas-${range.from}-a-${range.to}`,
        );
      }

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
      type Fila = (typeof rows)[number];

      if (format === "xlsx") {
        const columnas: ColumnaExcel<Fila>[] = [
          { titulo: "SKU", valor: (r) => r.sku, ancho: 14 },
          { titulo: "Producto", valor: (r) => r.name },
          {
            titulo: "Cantidad vendida",
            tipo: "cantidad",
            valor: (r) => aUnidades(r.quantitySold),
            totaliza: true,
            ancho: 16,
          },
          { titulo: "Unidad", valor: (r) => r.unit, ancho: 10 },
          {
            titulo: "Ingreso",
            tipo: "dinero",
            valor: (r) => aPesos(r.revenueCents),
            totaliza: true,
            ancho: 14,
          },
          {
            titulo: "Costo",
            tipo: "dinero",
            valor: (r) => aPesos(r.costCents),
            totaliza: true,
            ancho: 14,
          },
          {
            titulo: "Utilidad",
            tipo: "dinero",
            valor: (r) => aPesos(r.profitCents),
            totaliza: true,
            ancho: 14,
          },
          {
            titulo: "Margen",
            tipo: "porcentaje",
            // Los basis points van a fracción: Excel multiplica por 100 al
            // aplicar el formato de porcentaje. Mandar 24.24 daría 2424%.
            valor: (r) => (r.marginBps ?? 0) / 10000,
            ancho: 11,
          },
        ];

        return respuestaExcel(
          await construirExcel<Fila>({
            hoja: "Productos",
            titulo: "Productos vendidos",
            subtitulo: `${periodo} · ${generado(rows.length, "producto", "productos")}`,
            columnas,
            filas: rows,
          }),
          `productos-vendidos-${range.from}-a-${range.to}`,
        );
      }

      if (format === "csv") {
        return csvResponse(
          toCsv(rows, [
            { header: "SKU", value: (r) => r.sku },
            { header: "Producto", value: (r) => r.name },
            {
              header: "Cantidad vendida",
              value: (r) => csvQuantity(r.quantitySold),
            },
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
      type Fila = (typeof rows)[number];

      if (format === "xlsx") {
        const columnas: ColumnaExcel<Fila>[] = [
          { titulo: "Categoría", valor: (r) => r.categoryName, ancho: 26 },
          {
            titulo: "Movimientos",
            tipo: "entero",
            valor: (r) => r.count,
            totaliza: true,
            ancho: 13,
          },
          {
            titulo: "Total",
            tipo: "dinero",
            valor: (r) => aPesos(r.totalCents),
            totaliza: true,
            ancho: 15,
          },
          {
            titulo: "Participación",
            tipo: "porcentaje",
            valor: (r) => (r.shareBps ?? 0) / 10000,
            ancho: 14,
          },
        ];

        return respuestaExcel(
          await construirExcel<Fila>({
            hoja: "Gastos",
            titulo: "Gastos por categoría",
            subtitulo: `${periodo} · ${generado(rows.length, "categoría", "categorías")}`,
            columnas,
            filas: rows,
          }),
          `gastos-${range.from}-a-${range.to}`,
        );
      }

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
