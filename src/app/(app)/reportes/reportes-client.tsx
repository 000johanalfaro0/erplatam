"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import * as React from "react";

import { ExportButton } from "@/components/export-button";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { type Column, DataTable } from "@/components/ui/data-table";
import { Input, Select } from "@/components/ui/field";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
} from "@/components/ui/surface";
import { Stat } from "@/components/ui/stat";
import { api } from "@/lib/api";
import { dateInputValue, money, percent, quantity } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Reportes (requisito 11).
 *
 * DECISIÓN DE PRESENTACIÓN: no hay gráficas.
 *
 * No por falta de tiempo, sino porque ninguna respondería mejor que la tabla a
 * las preguntas reales del negocio: "¿cuánto vendí?", "¿qué me deja más?",
 * "¿en qué se me va el dinero?". Una gráfica de barras de cinco días no aporta
 * nada sobre cinco números alineados, y sí ocupa el espacio donde caben veinte
 * productos. El requisito era explícito: nada de gráficas por poder ponerlas.
 *
 * Lo que sí hay es exportación: quien quiera graficar lo hará en Excel, que es
 * donde ya sabe hacerlo.
 */

type ReportType = "summary" | "sales" | "products" | "expenses" | "inventory";

const REPORTS: {
  value: ReportType;
  label: string;
  question: string;
  hasRange: boolean;
}[] = [
  {
    value: "summary",
    label: "Resumen del periodo",
    question: "¿Gané dinero?",
    hasRange: true,
  },
  {
    value: "sales",
    label: "Ventas por periodo",
    question: "¿Cómo voy comparado con antes?",
    hasRange: true,
  },
  {
    value: "products",
    label: "Productos vendidos",
    question: "¿Qué me deja más ganancia?",
    hasRange: true,
  },
  {
    value: "expenses",
    label: "Gastos por categoría",
    question: "¿En qué se me va el dinero?",
    hasRange: true,
  },
  {
    value: "inventory",
    label: "Valor del inventario",
    question: "¿Cuánto tengo parado en el almacén?",
    hasRange: false,
  },
];

/** Primer día del mes en curso, en la zona del negocio. */
function inicioDeMes(timezone: string): string {
  const hoy = dateInputValue(new Date(), timezone);
  return `${hoy.slice(0, 8)}01`;
}

export function ReportesClient({
  initialSummary,
}: {
  initialSummary: unknown;
}) {
  const { business } = useSession();
  const settings = business.settings;

  const [type, setType] = React.useState<ReportType>("summary");
  const [from, setFrom] = React.useState(() => inicioDeMes(settings.timezone));
  const [to, setTo] = React.useState(() =>
    dateInputValue(new Date(), settings.timezone),
  );
  const [granularity, setGranularity] = React.useState("day");

  const config = REPORTS.find((report) => report.value === type)!;

  const query = React.useMemo(
    () =>
      config.hasRange
        ? { type, from, to, granularity }
        : { type },
    [type, from, to, granularity, config.hasRange],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["reports", query],
    queryFn: () => api.get<unknown>("/reports", query),
    placeholderData: (previous) => previous,
    /*
     * El resumen del mes en curso viene resuelto del servidor: es el reporte
     * que se abre por defecto. Al cambiar de reporte o de rango, la clave de
     * consulta cambia y se pide al servidor como siempre.
     */
    initialData:
      type === "summary" && from === inicioDeMes(settings.timezone)
        ? initialSummary
        : undefined,
  });

  return (
    <>
      <PageHeader
        title="Reportes"
        description={config.question}
        actions={
          type !== "summary" && (
            /*
             * Antes esto decía "Exportar a Excel" y descargaba un CSV. Se abre
             * en Excel, sí, pero llega sin formato: los importes como texto,
             * las fechas interpretadas según el idioma del equipo y los
             * acentos rotos al abrirlo con doble clic. Ahora es un .xlsx de
             * verdad, con números que suman y totales con fórmula.
             */
            <ExportButton
              endpoint="/reports"
              etiqueta="Exportar a Excel"
              filtros={{ ...(query as Record<string, string>), format: "xlsx" }}
            />
          )
        }
      />

      {/* --- Selector de reporte y rango --- */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1 sm:max-w-xs">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-muted">
            Reporte
          </span>
          <Select
            value={type}
            onChange={(event) => setType(event.target.value as ReportType)}
          >
            {REPORTS.map((report) => (
              <option key={report.value} value={report.value}>
                {report.label}
              </option>
            ))}
          </Select>
        </label>

        {config.hasRange && (
          <>
            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-ink-muted">
                Desde
              </span>
              <Input
                type="date"
                value={from}
                max={to}
                onChange={(event) => setFrom(event.target.value)}
                className="w-auto"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-[13px] font-medium text-ink-muted">
                Hasta
              </span>
              <Input
                type="date"
                value={to}
                min={from}
                onChange={(event) => setTo(event.target.value)}
                className="w-auto"
              />
            </label>
          </>
        )}

        {type === "sales" && (
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-ink-muted">
              Agrupar por
            </span>
            <Select
              value={granularity}
              onChange={(event) => setGranularity(event.target.value)}
              className="w-auto"
            >
              <option value="day">Día</option>
              <option value="week">Semana</option>
              <option value="month">Mes</option>
            </Select>
          </label>
        )}
      </div>

      {isLoading && !data ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-muted">Calculando…</p>
          </CardBody>
        </Card>
      ) : type === "summary" ? (
        <ResumenPeriodo data={data as never} />
      ) : type === "sales" ? (
        <TablaVentas rows={data as never} />
      ) : type === "products" ? (
        <TablaProductos rows={data as never} />
      ) : type === "expenses" ? (
        <TablaGastos rows={data as never} />
      ) : (
        <TablaInventario data={data as never} />
      )}

      <p className="mt-4 text-[12px] text-ink-subtle">
        Los días se cortan a la medianoche de {settings.timezone.replace("_", " ")},
        no en UTC. El IVA recaudado no cuenta como ingreso: es del SAT.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------

interface Summary {
  sales: {
    count: number;
    revenueCents: number;
    taxCollectedCents: number;
    grossCents: number;
    averageTicketCents: number;
  };
  costs: {
    costOfGoodsSoldCents: number;
    grossProfitCents: number;
    grossMarginBps: number | null;
  };
  expenses: { count: number; totalCents: number };
  result: { netProfitCents: number; netMarginBps: number | null };
  voided: { count: number; totalCents: number };
}

function ResumenPeriodo({ data }: { data: Summary | undefined }) {
  const { formatSettings } = useSession();
  if (!data) return null;

  const perdida = data.result.netProfitCents < 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Ventas"
          value={money(data.sales.revenueCents, formatSettings)}
          detail={`${data.sales.count} ${data.sales.count === 1 ? "venta" : "ventas"}`}
        />
        <Stat
          label="Ticket promedio"
          value={money(data.sales.averageTicketCents, formatSettings)}
        />
        <Stat
          label="Utilidad bruta"
          value={money(data.costs.grossProfitCents, formatSettings)}
          detail={
            data.costs.grossMarginBps !== null
              ? `margen ${percent(data.costs.grossMarginBps)}`
              : undefined
          }
        />
        <Stat
          label="Utilidad neta"
          value={money(data.result.netProfitCents, formatSettings)}
          detail={
            data.result.netMarginBps !== null
              ? `margen ${percent(data.result.netMarginBps)}`
              : undefined
          }
        />
      </div>

      {/* Estado de resultados en cascada: cada línea explica la siguiente. */}
      <Card>
        <CardHeader>
          <CardTitle>Cómo se llega a la utilidad</CardTitle>
        </CardHeader>
        <CardBody className="space-y-0 p-0">
          <Linea
            label="Ventas sin IVA"
            hint="El IVA no es tuyo, es del SAT"
            valueCents={data.sales.revenueCents}
          />
          <Linea
            label="− Costo de lo vendido"
            hint="Con el costo congelado al momento de cada venta"
            valueCents={-data.costs.costOfGoodsSoldCents}
          />
          <Linea
            label="= Utilidad bruta"
            valueCents={data.costs.grossProfitCents}
            emphasis
          />
          <Linea
            label="− Gastos"
            hint={`${data.expenses.count} ${data.expenses.count === 1 ? "gasto" : "gastos"} en el periodo`}
            valueCents={-data.expenses.totalCents}
          />
          <Linea
            label="= Utilidad neta"
            valueCents={data.result.netProfitCents}
            emphasis
            strong
          />
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <CardBody>
            <p className="text-[13px] text-ink-muted">IVA recaudado</p>
            <p className="numeric mt-1 text-lg font-semibold text-ink">
              {money(data.sales.taxCollectedCents, formatSettings)}
            </p>
            <p className="mt-1 text-[12px] text-ink-subtle">
              Lo cobraste al cliente y se lo debes al SAT. No es ganancia.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="text-[13px] text-ink-muted">Ventas canceladas</p>
            <p className="numeric mt-1 text-lg font-semibold text-ink">
              {data.voided.count}
            </p>
            <p className="mt-1 text-[12px] text-ink-subtle">
              {data.voided.count > 0
                ? `Por ${money(data.voided.totalCents, formatSettings)}. Un número alto merece revisarse en la bitácora.`
                : "Ninguna en el periodo."}
            </p>
          </CardBody>
        </Card>
      </div>

      {perdida && (
        <p
          role="status"
          className="rounded-md border border-warning/20 bg-warning-soft px-4 py-3 text-[13px] text-ink"
        >
          En este periodo los gastos superaron la utilidad bruta. Puede ser
          normal si hubo un gasto grande y puntual (renta anual, equipo), o una
          señal de que el margen no alcanza para cubrir la operación.
        </p>
      )}
    </div>
  );
}

function Linea({
  label,
  hint,
  valueCents,
  emphasis,
  strong,
}: {
  label: string;
  hint?: string;
  valueCents: number;
  emphasis?: boolean;
  strong?: boolean;
}) {
  const { formatSettings } = useSession();

  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 border-b border-line px-5 py-3 last:border-0",
        emphasis && "bg-surface-sunken",
      )}
    >
      <div className="min-w-0">
        <p
          className={cn(
            "text-sm text-ink",
            emphasis && "font-medium",
            strong && "text-[15px] font-semibold",
          )}
        >
          {label}
        </p>
        {hint && <p className="mt-0.5 text-[12px] text-ink-subtle">{hint}</p>}
      </div>
      <span
        className={cn(
          "numeric shrink-0 text-sm text-ink",
          emphasis && "font-medium",
          strong && "text-lg font-semibold",
          valueCents < 0 && !strong && "text-ink-muted",
          strong && valueCents < 0 && "text-danger",
        )}
      >
        {money(valueCents, formatSettings)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface SalesRow {
  period: string;
  salesCount: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  costCents: number;
  profitCents: number;
}

function TablaVentas({ rows }: { rows: SalesRow[] | undefined }) {
  const { formatSettings } = useSession();

  const columns: Column<SalesRow>[] = [
    { key: "period", header: "Periodo", cell: (r) => r.period },
    {
      key: "salesCount",
      header: "Ventas",
      align: "right",
      cell: (r) => r.salesCount,
    },
    {
      key: "totalCents",
      header: "Total cobrado",
      align: "right",
      cell: (r) => money(r.totalCents, formatSettings),
    },
    {
      key: "costCents",
      header: "Costo",
      align: "right",
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-ink-muted">{money(r.costCents, formatSettings)}</span>
      ),
    },
    {
      key: "profitCents",
      header: "Utilidad",
      align: "right",
      cell: (r) => (
        <span className="font-medium text-ink">
          {money(r.profitCents, formatSettings)}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      caption="Ventas por periodo"
      columns={columns}
      rows={rows ?? []}
      rowKey={(r) => r.period}
      empty={
        <EmptyState
          icon={<BarChart3 />}
          title="Sin ventas en este rango"
          description="Prueba con otro periodo."
        />
      }
    />
  );
}

interface ProductRow {
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

function TablaProductos({ rows }: { rows: ProductRow[] | undefined }) {
  const { formatSettings } = useSession();

  const columns: Column<ProductRow>[] = [
    {
      key: "name",
      header: "Producto",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{r.name}</p>
          <p className="numeric mt-0.5 text-[12px] text-ink-subtle">{r.sku}</p>
        </div>
      ),
    },
    {
      key: "quantitySold",
      header: "Vendido",
      align: "right",
      cell: (r) => quantity(r.quantitySold),
    },
    {
      key: "revenueCents",
      header: "Ingreso",
      align: "right",
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-ink-muted">{money(r.revenueCents, formatSettings)}</span>
      ),
    },
    {
      key: "profitCents",
      header: "Utilidad",
      align: "right",
      cell: (r) => (
        <span className="font-medium text-ink">
          {money(r.profitCents, formatSettings)}
        </span>
      ),
    },
    {
      key: "marginBps",
      header: "Margen",
      align: "right",
      cell: (r) => (
        <span
          className={cn(
            r.marginBps !== null && r.marginBps < 0
              ? "text-danger"
              : "text-ink-muted",
          )}
        >
          {r.marginBps !== null ? percent(r.marginBps) : "—"}
        </span>
      ),
    },
  ];

  return (
    <>
      <p className="mb-3 text-[13px] text-ink-muted">
        Ordenados por <span className="font-medium text-ink">utilidad</span>, no
        por unidades vendidas. Un producto puede venderse muchísimo y no dejarte
        nada.
      </p>
      <DataTable
        caption="Productos vendidos"
        columns={columns}
        rows={rows ?? []}
        rowKey={(r) => r.productId}
        empty={
          <EmptyState
            icon={<BarChart3 />}
            title="Sin ventas en este rango"
            description="Prueba con otro periodo."
          />
        }
      />
    </>
  );
}

interface ExpenseRow {
  categoryId: string | null;
  categoryName: string;
  count: number;
  totalCents: number;
  shareBps: number;
}

function TablaGastos({ rows }: { rows: ExpenseRow[] | undefined }) {
  const { formatSettings } = useSession();

  const columns: Column<ExpenseRow>[] = [
    { key: "categoryName", header: "Categoría", cell: (r) => r.categoryName },
    { key: "count", header: "Movimientos", align: "right", cell: (r) => r.count },
    {
      key: "totalCents",
      header: "Total",
      align: "right",
      cell: (r) => (
        <span className="font-medium text-ink">
          {money(r.totalCents, formatSettings)}
        </span>
      ),
    },
    {
      key: "shareBps",
      header: "Del total",
      align: "right",
      cell: (r) => (
        // Barra proporcional: se ve de un vistazo qué categoría se come el
        // presupuesto, sin necesidad de una gráfica aparte.
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${r.shareBps / 100}%` }}
            />
          </div>
          <span className="numeric w-12 text-right text-ink-muted">
            {percent(r.shareBps)}
          </span>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      caption="Gastos por categoría"
      columns={columns}
      rows={rows ?? []}
      rowKey={(r) => r.categoryId ?? "sin-categoria"}
      empty={
        <EmptyState
          icon={<BarChart3 />}
          title="Sin gastos en este rango"
          description="Prueba con otro periodo."
        />
      }
    />
  );
}

interface InventoryData {
  rows: {
    productId: string;
    sku: string;
    name: string;
    stock: number;
    costCents: number;
    stockCostCents: number;
    stockRetailCents: number;
    isLowStock: boolean;
  }[];
  totalCostCents: number;
  totalRetailCents: number;
}

function TablaInventario({ data }: { data: InventoryData | undefined }) {
  const { formatSettings } = useSession();
  if (!data) return null;

  const columns: Column<InventoryData["rows"][number]>[] = [
    {
      key: "name",
      header: "Producto",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{r.name}</p>
          <p className="numeric mt-0.5 text-[12px] text-ink-subtle">{r.sku}</p>
        </div>
      ),
    },
    {
      key: "stock",
      header: "Existencia",
      align: "right",
      cell: (r) => (
        <span className={r.isLowStock ? "font-medium text-warning" : "text-ink"}>
          {quantity(r.stock)}
        </span>
      ),
    },
    {
      key: "stockCostCents",
      header: "Valor a costo",
      align: "right",
      cell: (r) => money(r.stockCostCents, formatSettings),
    },
    {
      key: "stockRetailCents",
      header: "Valor a venta",
      align: "right",
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-ink-muted">
          {money(r.stockRetailCents, formatSettings)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat
          label="Dinero invertido en almacén"
          value={money(data.totalCostCents, formatSettings)}
          detail="lo que te costó"
        />
        <Stat
          label="Si lo vendieras todo"
          value={money(data.totalRetailCents, formatSettings)}
          detail={`utilidad potencial ${money(data.totalRetailCents - data.totalCostCents, formatSettings)}`}
        />
      </div>

      <DataTable
        caption="Valor del inventario"
        columns={columns}
        rows={data.rows}
        rowKey={(r) => r.productId}
        rowTone={(r) => (r.isLowStock ? "warning" : "default")}
        empty={
          <EmptyState
            icon={<BarChart3 />}
            title="Sin productos con inventario"
            description="Los productos que no controlan existencia no aparecen aquí."
          />
        }
      />
    </div>
  );
}
