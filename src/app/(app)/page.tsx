import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, PackageSearch, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
} from "@/components/ui/surface";
import { Stat } from "@/components/ui/stat";
import { dateRelative, money, moneyCompact, percent, quantityWithUnit } from "@/lib/format";
import { requireContext } from "@/server/http/context";
import { getCurrentUser } from "@/server/modules/auth";
import { getDashboard } from "@/server/modules/reports";

export const metadata: Metadata = { title: "Panel" };

/**
 * Panel principal.
 *
 * Es un Server Component: las métricas se consultan en el servidor y llegan ya
 * renderizadas. No hay estado de carga ni petición desde el navegador, así que
 * la pantalla que más se abre al día es también la más rápida.
 */
export default async function DashboardPage() {
  const ctx = await requireContext();
  const [metrics, user] = await Promise.all([
    getDashboard(ctx),
    getCurrentUser(ctx),
  ]);

  const fmt = user.business.settings!;

  return (
    <>
      <PageHeader
        title="Panel"
        description="Cómo va el negocio hoy."
        actions={
          <Button asChild variant="primary">
            <Link href="/ventas/nueva">
              <Plus />
              Nueva venta
            </Link>
          </Button>
        }
      />

      {/* --- Métricas --- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Ventas de hoy"
          value={money(metrics.today.revenueCents, fmt)}
          detail={pluralize(metrics.today.salesCount, "venta", "ventas")}
          changeBps={metrics.today.changeVsYesterdayBps}
        />
        <Stat
          label="Ventas del mes"
          value={moneyCompact(metrics.month.revenueCents, fmt)}
          detail={pluralize(metrics.month.salesCount, "venta", "ventas")}
        />
        <Stat
          label="Gastos del mes"
          value={moneyCompact(metrics.month.expensesCents, fmt)}
          higherIsBetter={false}
        />
        <Stat
          label="Ganancia estimada"
          value={moneyCompact(metrics.month.estimatedProfitCents, fmt)}
          detail={
            metrics.month.grossMarginBps !== null
              ? `margen ${percent(metrics.month.grossMarginBps)}`
              : undefined
          }
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* --- Últimas ventas --- */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Últimas ventas</CardTitle>
            <Link
              href="/ventas"
              className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline"
            >
              Ver todas
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </CardHeader>

          {metrics.recentSales.length === 0 ? (
            <EmptyState
              icon={<PackageSearch />}
              title="Todavía no hay ventas"
              description="En cuanto registres la primera aparecerá aquí."
              action={
                <Button asChild variant="primary" size="sm">
                  <Link href="/ventas/nueva">Registrar una venta</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {metrics.recentSales.map((sale) => (
                <li key={sale.id}>
                  <Link
                    href={`/ventas/${sale.id}`}
                    className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-sunken"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                        <span className="numeric">{sale.folio}</span>
                        {sale.status === "VOIDED" && (
                          <Badge tone="danger">Cancelada</Badge>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-ink-subtle">
                        {sale.customerName ?? "Público en general"} ·{" "}
                        {sale.itemCount}{" "}
                        {sale.itemCount === 1 ? "producto" : "productos"} ·{" "}
                        {sale.userName}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={
                          sale.status === "VOIDED"
                            ? "numeric text-[13px] font-medium text-ink-subtle line-through"
                            : "numeric text-[13px] font-medium text-ink"
                        }
                      >
                        {money(sale.totalCents, fmt)}
                      </p>
                      <p className="mt-0.5 text-[12px] text-ink-subtle">
                        {dateRelative(sale.createdAt, fmt)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* --- Stock bajo: la lista más accionable del panel --- */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Hay que resurtir</CardTitle>
            {metrics.lowStock.count > 0 && (
              <Badge tone="warning">
                <AlertTriangle className="size-3" aria-hidden />
                {metrics.lowStock.count}
              </Badge>
            )}
          </CardHeader>

          {metrics.lowStock.items.length === 0 ? (
            <EmptyState
              title="Todo con existencia suficiente"
              description="Ningún producto está por debajo de su punto de reorden."
            />
          ) : (
            <>
              <ul className="divide-y divide-line">
                {metrics.lowStock.items.map((product) => (
                  <li key={product.id}>
                    <Link
                      href={`/inventario/${product.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-sunken"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-ink">
                          {product.name}
                        </p>
                        <p className="numeric mt-0.5 text-[12px] text-ink-subtle">
                          {product.sku}
                        </p>
                      </div>
                      <span
                        className={
                          product.stock <= 0
                            ? "numeric shrink-0 text-[13px] font-medium text-danger"
                            : "numeric shrink-0 text-[13px] font-medium text-warning"
                        }
                      >
                        {quantityWithUnit(product.stock, product.unit)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {metrics.lowStock.count > metrics.lowStock.items.length && (
                <CardBody className="border-t border-line py-3">
                  <Link
                    href="/inventario?lowStock=true"
                    className="text-[13px] text-accent hover:underline"
                  >
                    Ver los {metrics.lowStock.count} productos
                  </Link>
                </CardBody>
              )}
            </>
          )}
        </Card>
      </div>

      {/* --- Actividad reciente: la auditoría, en lenguaje humano --- */}
      {metrics.recentActivity.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Actividad reciente</CardTitle>
            <Link
              href="/auditoria"
              className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline"
            >
              Ver bitácora
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </CardHeader>
          <ul className="divide-y divide-line">
            {metrics.recentActivity.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 px-5 py-2.5 text-[13px]"
              >
                <span className="min-w-0 flex-1 truncate text-ink">
                  <span className="font-medium">{entry.userName ?? "Sistema"}</span>{" "}
                  <span className="text-ink-muted">
                    {describeAction(entry.action)}
                  </span>
                </span>
                <span className="shrink-0 text-[12px] text-ink-subtle">
                  {dateRelative(entry.createdAt, fmt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

/** "1 venta" / "3 ventas". Un "1 ventas" delata software descuidado. */
function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Traduce el verbo técnico de la bitácora a español llano.
 *
 * La bitácora guarda `sale.create` porque es estable y filtrable; el usuario
 * lee "registró una venta". Los datos se guardan para la máquina y se
 * presentan para la persona.
 */
function describeAction(action: string): string {
  const map: Record<string, string> = {
    "auth.login": "inició sesión",
    "auth.logout": "cerró sesión",
    "auth.login_failed": "falló al iniciar sesión",
    "sale.create": "registró una venta",
    "sale.void": "canceló una venta",
    "product.create": "dio de alta un producto",
    "product.update": "editó un producto",
    "product.delete": "eliminó un producto",
    "inventory.adjust": "ajustó el inventario",
    "inventory.entry": "registró una entrada de mercancía",
    "inventory.exit": "registró una salida de mercancía",
    "purchase.create": "registró una compra",
    "purchase.void": "canceló una compra",
    "expense.create": "registró un gasto",
    "customer.create": "dio de alta un cliente",
    "supplier.create": "dio de alta un proveedor",
    "settings.update": "cambió la configuración",
    "user.create": "creó un usuario",
    "user.update": "modificó un usuario",
  };

  return map[action] ?? action;
}
