"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  ChevronRight,
  Eye,
  MoreHorizontal,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { useCan, useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { type Column, DataTable, Pagination } from "@/components/ui/data-table";
import { Input, Select } from "@/components/ui/field";
import {
  ConfirmationDialog,
  Drawer,
  DrawerContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/overlay";
import { Badge, EmptyState, PageHeader } from "@/components/ui/surface";
import { ApiError, api, type Paginated } from "@/lib/api";
import { money, dateRelative, quantity, percent } from "@/lib/format";
import {
  type Sale,
  type SaleDetail,
  useSales,
  useSale,
} from "@/lib/queries";

/**
 * Ventas: historial de ventas del negocio.
 *
 * Es la pantalla de referencia después de cobrar: confirmar que la venta se
 * registró, consultar un ticket pasado, cancelar una venta incorrecta. Todo
 * lo que el encargado y el cajero necesitan saber de lo vendido.
 */

const STATUS_LABELS: Record<string, { label: string; tone: "positive" | "danger" }> = {
  COMPLETED: { label: "Completada", tone: "positive" },
  VOIDED: { label: "Cancelada", tone: "danger" },
};

export function VentasClient({
  initialData,
}: {
  initialData: Paginated<Sale>;
}) {
  const { business } = useSession();
  const canCreate = useCan("sales:create");
  const canVoid = useCan("sales:void");
  const queryClient = useQueryClient();

  // --- Filtros y paginación ---
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [sort, setSort] = React.useState<{
    key: string;
    direction: "asc" | "desc";
  }>({ key: "createdAt", direction: "desc" });

  // --- Estado de los paneles ---
  const [viewingId, setViewingId] = React.useState<string | null>(null);
  const [voidingSale, setVoidingSale] = React.useState<Sale | null>(null);
  const [voidReason, setVoidReason] = React.useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const sinFiltros =
    !debouncedSearch && !status && !dateFrom && !dateTo && page === 1;

  const { data, isLoading } = useSales(
    {
      search: debouncedSearch || undefined,
      status: status || undefined,
      from: dateFrom || undefined,
      to: dateTo ? `${dateTo}T23:59:59.999Z` : undefined,
      page,
      pageSize: 25,
      sortBy: sort.key,
      sortDir: sort.direction,
    },
    /*
     * Primera carga resuelta en el servidor, dentro del mismo viaje que la
     * página (ver el page.tsx de esta carpeta).
     *
     * La condición es imprescindible: la clave de consulta incluye los
     * filtros, así que sin ella se mostrarían estas mismas ventas al filtrar
     * por cualquier otra cosa.
     */
    sinFiltros ? initialData : undefined,
  );

  const { data: saleDetail, isLoading: loadingDetail } = useSale(viewingId);

  // --- Cancelación ---
  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/sales/${id}/void`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setVoidingSale(null);
      setVoidReason("");
      toast.success("Venta cancelada", {
        description: "El inventario se restauró automáticamente.",
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "No pudimos cancelar la venta.",
      );
    },
  });

  const columns: Column<Sale>[] = [
    {
      key: "folio",
      header: "Folio",
      sortable: true,
      cell: (sale) => (
        <button
          type="button"
          className="numeric text-[13px] font-medium text-accent hover:underline"
          onClick={() => setViewingId(sale.id)}
        >
          {sale.folio}
        </button>
      ),
    },
    {
      key: "createdAt",
      header: "Fecha",
      sortable: true,
      cell: (sale) => (
        <span className="text-[13px] text-ink-muted">
          {dateRelative(sale.createdAt, business.settings)}
        </span>
      ),
    },
    {
      key: "customer",
      header: "Cliente",
      hideOnMobile: true,
      cell: (sale) =>
        sale.customer ? (
          <span className="text-[13px] text-ink">{sale.customer.name}</span>
        ) : (
          <span className="text-[13px] text-ink-subtle">Público general</span>
        ),
    },
    {
      key: "items",
      header: "Productos",
      align: "right",
      hideOnMobile: true,
      cell: (sale) => (
        <span className="numeric text-[13px] text-ink-muted">
          {sale._count.items}
        </span>
      ),
    },
    {
      key: "payment",
      header: "Pago",
      hideOnMobile: true,
      cell: (sale) => (
        <span className="text-[13px] text-ink-muted">
          {sale.payments.map((p) => p.method.name).join(", ") || "—"}
        </span>
      ),
    },
    {
      key: "totalCents",
      header: "Total",
      align: "right",
      sortable: true,
      cell: (sale) => (
        <span
          className={`numeric font-medium ${
            sale.status === "VOIDED" ? "text-ink-subtle line-through" : "text-ink"
          }`}
        >
          {money(sale.totalCents, business.settings)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Estado",
      cell: (sale) => {
        const info = STATUS_LABELS[sale.status];
        return info ? <Badge tone={info.tone}>{info.label}</Badge> : null;
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-12",
      cell: (sale) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Acciones para ${sale.folio}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setViewingId(sale.id)}>
              <Eye />
              Ver detalle
            </DropdownMenuItem>
            {canVoid && sale.status === "COMPLETED" && (
              <DropdownMenuItem
                tone="danger"
                onSelect={() => setVoidingSale(sale)}
              >
                <Ban />
                Cancelar venta
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const hasFilters = Boolean(debouncedSearch || status || dateFrom || dateTo);

  return (
    <>
      <PageHeader
        title="Ventas"
        description="Historial de ventas registradas."
        actions={
          canCreate && (
            <Button variant="primary" asChild>
              <Link href="/ventas/nueva">
                <Plus />
                Nueva venta
              </Link>
            </Button>
          )
        }
      />

      {/* --- Filtros --- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por folio…"
            aria-label="Buscar ventas"
            className="pl-9"
          />
        </div>

        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filtrar por estado"
          className="w-auto min-w-40"
        >
          <option value="">Todos los estados</option>
          <option value="COMPLETED">Completadas</option>
          <option value="VOIDED">Canceladas</option>
        </Select>

        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          aria-label="Desde"
          className="w-auto"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          aria-label="Hasta"
          className="w-auto"
        />
      </div>

      <DataTable
        caption="Historial de ventas"
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(sale) => sale.id}
        loading={isLoading}
        sort={sort}
        onSortChange={setSort}
        rowTone={(sale) =>
          sale.status === "VOIDED" ? "muted" : "default"
        }
        empty={
          hasFilters ? (
            <EmptyState
              icon={<Search />}
              title="Sin coincidencias"
              description="Ninguna venta coincide con estos filtros."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setStatus("");
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Limpiar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<ShoppingCart />}
              title="Sin ventas todavía"
              description="Las ventas que registres aparecerán aquí."
              action={
                canCreate && (
                  <Button variant="primary" size="sm" asChild>
                    <Link href="/ventas/nueva">Registrar la primera venta</Link>
                  </Button>
                )
              }
            />
          )
        }
      />

      {data && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={setPage}
        />
      )}

      {/* --- Detalle de venta --- */}
      <Drawer open={viewingId !== null} onOpenChange={(open) => !open && setViewingId(null)}>
        <DrawerContent
          title={saleDetail ? `Venta ${saleDetail.folio}` : "Cargando…"}
          description={
            saleDetail
              ? dateRelative(saleDetail.createdAt, business.settings)
              : undefined
          }
          width="lg"
        >
          {loadingDetail || !saleDetail ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-sm text-ink-muted">Cargando detalle…</div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Estado y cajero */}
              <div className="flex items-center justify-between">
                <Badge tone={STATUS_LABELS[saleDetail.status]?.tone ?? "neutral"}>
                  {STATUS_LABELS[saleDetail.status]?.label ?? saleDetail.status}
                </Badge>
                <span className="text-[13px] text-ink-muted">
                  Registró: {saleDetail.user.name}
                </span>
              </div>

              {/* Cancelación */}
              {saleDetail.status === "VOIDED" && saleDetail.voidReason && (
                <div className="rounded-md border border-danger/20 bg-danger-soft px-4 py-3">
                  <p className="text-[13px] font-medium text-danger">Motivo de cancelación</p>
                  <p className="mt-0.5 text-[13px] text-ink-muted">{saleDetail.voidReason}</p>
                </div>
              )}

              {/* Cliente */}
              {saleDetail.customer && (
                <div>
                  <p className="text-[12px] font-medium uppercase tracking-wide text-ink-subtle">
                    Cliente
                  </p>
                  <p className="mt-1 text-sm text-ink">{saleDetail.customer.name}</p>
                  {saleDetail.customer.rfc && (
                    <p className="numeric text-[13px] text-ink-muted">
                      RFC: {saleDetail.customer.rfc}
                    </p>
                  )}
                </div>
              )}

              {/* Líneas */}
              <div>
                <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-subtle">
                  Productos
                </p>
                <div className="divide-y divide-line rounded-md border border-line">
                  {saleDetail.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink">{item.productName}</p>
                        <p className="numeric text-[12px] text-ink-subtle">
                          {item.productSku} · {quantity(item.quantity)} ×{" "}
                          {money(item.unitPriceCents, business.settings)}
                        </p>
                      </div>
                      <p className="numeric shrink-0 text-sm font-medium text-ink">
                        {money(item.totalCents, business.settings)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totales */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-ink-muted">
                  <span>Subtotal</span>
                  <span className="numeric">
                    {money(saleDetail.subtotalCents, business.settings)}
                  </span>
                </div>
                {saleDetail.discountCents > 0 && (
                  <div className="flex justify-between text-ink-muted">
                    <span>Descuento</span>
                    <span className="numeric text-danger">
                      −{money(saleDetail.discountCents, business.settings)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-ink-muted">
                  <span>IVA</span>
                  <span className="numeric">
                    {money(saleDetail.taxCents, business.settings)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-line pt-2 font-semibold text-ink">
                  <span>Total</span>
                  <span className="numeric">
                    {money(saleDetail.totalCents, business.settings)}
                  </span>
                </div>
              </div>

              {/* Pagos */}
              <div>
                <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-subtle">
                  Pagos
                </p>
                <div className="space-y-1.5">
                  {saleDetail.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-ink-muted">{payment.method.name}</span>
                      <span className="numeric text-ink">
                        {money(payment.amountCents, business.settings)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notas */}
              {saleDetail.notes && (
                <div>
                  <p className="text-[12px] font-medium uppercase tracking-wide text-ink-subtle">
                    Notas
                  </p>
                  <p className="mt-1 text-[13px] text-ink-muted">{saleDetail.notes}</p>
                </div>
              )}

              {/* Acción de cancelar */}
              {canVoid && saleDetail.status === "COMPLETED" && (
                <div className="border-t border-line pt-4">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      const sale: Sale = {
                        id: saleDetail.id,
                        folio: saleDetail.folio,
                        status: saleDetail.status,
                        subtotalCents: saleDetail.subtotalCents,
                        taxCents: saleDetail.taxCents,
                        totalCents: saleDetail.totalCents,
                        createdAt: saleDetail.createdAt,
                        customer: saleDetail.customer,
                        user: saleDetail.user,
                        _count: { items: saleDetail.items.length },
                        payments: saleDetail.payments,
                      };
                      setViewingId(null);
                      setVoidingSale(sale);
                    }}
                  >
                    <Ban />
                    Cancelar esta venta
                  </Button>
                </div>
              )}
            </div>
          )}
        </DrawerContent>
      </Drawer>

      {/* --- Confirmación de cancelación --- */}
      <ConfirmationDialog
        open={voidingSale !== null}
        onOpenChange={(open) => {
          if (!open) {
            setVoidingSale(null);
            setVoidReason("");
          }
        }}
        title={`¿Cancelar venta ${voidingSale?.folio}?`}
        description={
          voidingSale
            ? `Se cancelará la venta por ${money(
                voidingSale.totalCents,
                business.settings,
              )}. El inventario de los productos se restaurará automáticamente. Esta acción no se puede deshacer.`
            : ""
        }
        confirmLabel="Cancelar venta"
        loading={voidMutation.isPending}
        onConfirm={() => {
          if (voidingSale && voidReason.trim().length >= 5) {
            voidMutation.mutate({
              id: voidingSale.id,
              reason: voidReason.trim(),
            });
          }
        }}
      >
        <div className="mt-3">
          <label
            htmlFor="void-reason"
            className="mb-1.5 block text-[13px] font-medium text-ink"
          >
            Motivo de cancelación
          </label>
          <Input
            id="void-reason"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="Explica por qué se cancela…"
            aria-label="Motivo de cancelación"
          />
          {voidReason.trim().length > 0 && voidReason.trim().length < 5 && (
            <p className="mt-1 text-[12px] text-danger">
              Mínimo 5 caracteres.
            </p>
          )}
        </div>
      </ConfirmationDialog>
    </>
  );
}
