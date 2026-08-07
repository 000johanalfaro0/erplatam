"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  Plus,
  Search,
  Trash2,
  Truck,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useCan, useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { type Column, DataTable, Pagination } from "@/components/ui/data-table";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { MoneyInput, QuantityInput } from "@/components/ui/money-input";
import {
  Drawer,
  DrawerContent,
  Modal,
  ModalContent,
} from "@/components/ui/overlay";
import { Badge, EmptyState, PageHeader } from "@/components/ui/surface";
import { ApiError, api, type Paginated } from "@/lib/api";
import { dateInputValue, dateShort, money, quantity } from "@/lib/format";
import { useReference } from "@/lib/queries";
import { computeLine, sumDocument } from "@/server/core/pricing";

/**
 * Compras (requisito 7).
 *
 * Registrar una compra hace DOS cosas: sube el inventario y actualiza el costo
 * del producto. Lo segundo es lo que mantiene el margen del panel pegado a la
 * realidad, y la pantalla lo dice explícitamente — si no, el usuario no
 * entendería por qué al día siguiente su ganancia cambió.
 *
 * Los costos de proveedor normalmente vienen SIN IVA, al revés que los precios
 * de mostrador. Por eso la casilla existe y viene desmarcada por defecto.
 */

interface Purchase {
  id: string;
  folio: string;
  status: "DRAFT" | "RECEIVED" | "VOIDED";
  totalCents: number;
  invoiceNumber: string | null;
  purchasedAt: string;
  supplier: { id: string; name: string } | null;
  user: { id: string; name: string };
  _count: { items: number };
}

interface Linea {
  productId: string;
  productName: string;
  productSku: string;
  taxRateBps: number;
  quantity: number;
  unitCostCents: number;
}

export default function ComprasPage() {
  const { business } = useSession();
  const canWrite = useCan("purchases:write");
  const canVoid = useCan("purchases:void");
  const queryClient = useQueryClient();
  const { data: reference } = useReference();

  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [formOpen, setFormOpen] = React.useState(false);
  const [voiding, setVoiding] = React.useState<Purchase | null>(null);
  const [voidReason, setVoidReason] = React.useState("");

  // --- Formulario de compra ---
  const [supplierId, setSupplierId] = React.useState("");
  const [invoiceNumber, setInvoiceNumber] = React.useState("");
  const [purchasedAt, setPurchasedAt] = React.useState(() =>
    dateInputValue(new Date(), business.settings.timezone),
  );
  const [costsIncludeTax, setCostsIncludeTax] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [lineas, setLineas] = React.useState<Linea[]>([]);
  const [buscar, setBuscar] = React.useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["purchases", { debounced, page }],
    queryFn: () =>
      api.get<Paginated<Purchase>>("/purchases", {
        search: debounced || undefined,
        page,
        pageSize: 25,
      }),
    placeholderData: (previous) => previous,
  });

  // Buscador de productos dentro del formulario.
  const [debouncedBuscar, setDebouncedBuscar] = React.useState("");
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedBuscar(buscar.trim()), 200);
    return () => clearTimeout(timer);
  }, [buscar]);

  const { data: productos } = useQuery({
    queryKey: ["compras-productos", debouncedBuscar],
    queryFn: () =>
      api.get<{
        items: {
          id: string;
          sku: string;
          name: string;
          costCents: number;
          taxRate: { rateBps: number } | null;
        }[];
      }>("/products", { search: debouncedBuscar, pageSize: 6 }),
    select: (r) => r.items,
    enabled: formOpen && debouncedBuscar.length >= 2,
  });

  /**
   * Totales calculados con las MISMAS funciones puras del servidor, igual que
   * en el punto de venta. El servidor recalcula igualmente.
   */
  const totales = React.useMemo(() => {
    const computadas = lineas.map((linea) =>
      computeLine({
        quantityMilli: linea.quantity,
        unitPriceCents: linea.unitCostCents,
        taxRateBps: linea.taxRateBps,
        priceIncludesTax: costsIncludeTax,
      }),
    );
    return sumDocument(computadas);
  }, [lineas, costsIncludeTax]);

  function limpiar() {
    setSupplierId("");
    setInvoiceNumber("");
    setPurchasedAt(dateInputValue(new Date(), business.settings.timezone));
    setCostsIncludeTax(false);
    setNotes("");
    setLineas([]);
    setBuscar("");
  }

  const registrar = useMutation({
    mutationFn: () =>
      api.post("/purchases", {
        items: lineas.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitCostCents: l.unitCostCents,
        })),
        supplierId: supplierId || null,
        invoiceNumber: invoiceNumber || null,
        purchasedAt: new Date(`${purchasedAt}T12:00:00`).toISOString(),
        costsIncludeTax,
        notes: notes || null,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Compra registrada", {
        description: "El inventario subió y se actualizó el costo de los productos.",
      });
      setFormOpen(false);
      limpiar();
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : "No pudimos registrar la compra.",
      );
    },
  });

  const cancelar = useMutation({
    mutationFn: (id: string) =>
      api.post(`/purchases/${id}/void`, { reason: voidReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Compra cancelada", {
        description: "La mercancía salió del inventario.",
      });
      setVoiding(null);
      setVoidReason("");
    },
    onError: (error) => {
      // Cancelar puede fallar legítimamente si la mercancía ya se vendió. El
      // mensaje del servidor explica qué hacer, así que se muestra completo.
      toast.error(
        error instanceof ApiError ? error.message : "No pudimos cancelar la compra.",
        { duration: 12000 },
      );
    },
  });

  function agregar(producto: {
    id: string;
    sku: string;
    name: string;
    costCents: number;
    taxRate: { rateBps: number } | null;
  }) {
    setLineas((actuales) => {
      const existente = actuales.findIndex((l) => l.productId === producto.id);
      if (existente >= 0) {
        const copia = [...actuales];
        copia[existente] = {
          ...copia[existente],
          quantity: copia[existente].quantity + 1000,
        };
        return copia;
      }
      return [
        ...actuales,
        {
          productId: producto.id,
          productName: producto.name,
          productSku: producto.sku,
          taxRateBps:
            producto.taxRate?.rateBps ?? business.settings.defaultTaxRateBps,
          quantity: 1000,
          // Se precarga el último costo conocido: lo habitual es que no haya
          // cambiado, y así solo se corrige cuando sí cambió.
          unitCostCents: producto.costCents,
        },
      ];
    });
    setBuscar("");
  }

  const columns: Column<Purchase>[] = [
    {
      key: "folio",
      header: "Folio",
      cell: (p) => (
        <div className="min-w-0">
          <p className="numeric font-medium text-ink">{p.folio}</p>
          {p.invoiceNumber && (
            <p className="numeric mt-0.5 text-[12px] text-ink-subtle">
              Factura {p.invoiceNumber}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "purchasedAt",
      header: "Fecha",
      cell: (p) => (
        <span className="whitespace-nowrap text-ink-muted">
          {dateShort(p.purchasedAt, business.settings)}
        </span>
      ),
    },
    {
      key: "supplier",
      header: "Proveedor",
      cell: (p) => (
        <span className="text-[13px] text-ink">
          {p.supplier?.name ?? "Sin proveedor"}
        </span>
      ),
    },
    {
      key: "items",
      header: "Productos",
      align: "right",
      hideOnMobile: true,
      cell: (p) => p._count.items,
    },
    {
      key: "status",
      header: "Estado",
      cell: (p) =>
        p.status === "VOIDED" ? (
          <Badge tone="danger">Cancelada</Badge>
        ) : (
          <Badge tone="positive">Recibida</Badge>
        ),
    },
    {
      key: "totalCents",
      header: "Total",
      align: "right",
      cell: (p) => (
        <span
          className={
            p.status === "VOIDED"
              ? "text-ink-subtle line-through"
              : "font-medium text-ink"
          }
        >
          {money(p.totalCents, business.settings)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-12",
      cell: (p) =>
        canVoid && p.status !== "VOIDED" ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Cancelar compra ${p.folio}`}
            onClick={() => setVoiding(p)}
          >
            <Ban />
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Compras"
        description="Mercancía que entra. Sube el inventario y actualiza tus costos."
        actions={
          canWrite && (
            <Button
              variant="primary"
              onClick={() => {
                limpiar();
                setFormOpen(true);
              }}
            >
              <Truck />
              Registrar compra
            </Button>
          )
        }
      />

      <div className="mb-4 relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por folio o número de factura…"
          aria-label="Buscar compras"
          className="pl-9"
        />
      </div>

      <DataTable
        caption="Listado de compras"
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(p) => p.id}
        loading={isLoading}
        rowTone={(p) => (p.status === "VOIDED" ? "muted" : "default")}
        empty={
          <EmptyState
            icon={<Truck />}
            title={debounced ? "Sin coincidencias" : "Todavía no hay compras"}
            description="Al registrar una compra, el inventario sube y se actualiza cuánto te cuesta cada producto."
            action={
              canWrite && !debounced ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    limpiar();
                    setFormOpen(true);
                  }}
                >
                  Registrar la primera
                </Button>
              ) : undefined
            }
          />
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

      {/* --- Registrar compra --- */}
      <Drawer open={formOpen} onOpenChange={setFormOpen}>
        <DrawerContent
          title="Registrar compra"
          description="Se recibirá la mercancía y se actualizará el costo de cada producto."
          width="xl"
          footer={
            <>
              <Button variant="secondary" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                loading={registrar.isPending}
                disabled={lineas.length === 0}
                onClick={() => registrar.mutate()}
              >
                Registrar y recibir
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Proveedor">
                {(props) => (
                  <Select
                    {...props}
                    value={supplierId}
                    onChange={(event) => setSupplierId(event.target.value)}
                  >
                    <option value="">Sin proveedor</option>
                    {reference?.suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Número de factura" hint="El del proveedor">
                {(props) => (
                  <Input
                    {...props}
                    value={invoiceNumber}
                    onChange={(event) => setInvoiceNumber(event.target.value)}
                    placeholder="A-45821"
                    className="numeric"
                  />
                )}
              </Field>

              <Field label="Fecha de la compra" hint="Puede ser anterior a hoy">
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    value={purchasedAt}
                    onChange={(event) => setPurchasedAt(event.target.value)}
                  />
                )}
              </Field>
            </div>

            <Checkbox
              label="Los costos ya incluyen IVA"
              description="Con proveedores lo normal es que NO: el costo va sin impuesto y se suma aparte."
              checked={costsIncludeTax}
              onChange={(event) => setCostsIncludeTax(event.target.checked)}
            />

            {/* --- Buscador de productos --- */}
            <div className="border-t border-line pt-5">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
                  aria-hidden
                />
                <Input
                  value={buscar}
                  onChange={(event) => setBuscar(event.target.value)}
                  placeholder="Buscar producto para agregar…"
                  aria-label="Buscar producto"
                  className="pl-9"
                />
              </div>

              {debouncedBuscar.length >= 2 && (productos?.length ?? 0) > 0 && (
                <ul className="mt-1.5 overflow-hidden rounded-md border border-line">
                  {productos?.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => agregar(p)}
                        className="flex w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-0 transition-colors hover:bg-surface-sunken"
                      >
                        <Plus className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">
                            {p.name}
                          </span>
                          <span className="numeric block text-[12px] text-ink-subtle">
                            {p.sku}
                          </span>
                        </span>
                        <span className="numeric shrink-0 text-[12px] text-ink-muted">
                          último costo {money(p.costCents, business.settings)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* --- Líneas --- */}
            {lineas.length === 0 ? (
              <p className="rounded-md border border-line bg-surface-sunken px-4 py-6 text-center text-[13px] text-ink-subtle">
                Busca y agrega los productos que estás recibiendo.
              </p>
            ) : (
              <table className="w-full text-sm">
                <caption className="sr-only">Productos de la compra</caption>
                <thead>
                  <tr className="border-b border-line text-[12px] text-ink-muted">
                    <th scope="col" className="py-2 text-left font-medium">Producto</th>
                    <th scope="col" className="py-2 text-center font-medium">Cantidad</th>
                    <th scope="col" className="py-2 text-right font-medium">Costo unitario</th>
                    <th scope="col" className="py-2 text-right font-medium">Importe</th>
                    <th scope="col" className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((linea, index) => (
                    <tr key={linea.productId} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-2">
                        <p className="truncate text-[13px] font-medium text-ink">
                          {linea.productName}
                        </p>
                        <p className="numeric text-[12px] text-ink-subtle">
                          {linea.productSku}
                        </p>
                      </td>
                      <td className="px-2 py-2.5">
                        <QuantityInput
                          valueMilli={linea.quantity}
                          onValueChange={(milli) =>
                            setLineas((a) =>
                              a.map((l, i) => (i === index ? { ...l, quantity: milli } : l)),
                            )
                          }
                          aria-label={`Cantidad de ${linea.productName}`}
                          className="w-20 text-center"
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <MoneyInput
                          valueCents={linea.unitCostCents}
                          onValueChange={(cents) =>
                            setLineas((a) =>
                              a.map((l, i) => (i === index ? { ...l, unitCostCents: cents } : l)),
                            )
                          }
                          aria-label={`Costo unitario de ${linea.productName}`}
                          className="w-28"
                        />
                      </td>
                      <td className="numeric py-2.5 text-right font-medium text-ink">
                        {money(
                          computeLine({
                            quantityMilli: linea.quantity,
                            unitPriceCents: linea.unitCostCents,
                            taxRateBps: linea.taxRateBps,
                            priceIncludesTax: costsIncludeTax,
                          }).totalCents,
                          business.settings,
                        )}
                      </td>
                      <td className="py-2.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Quitar ${linea.productName}`}
                          onClick={() =>
                            setLineas((a) => a.filter((_, i) => i !== index))
                          }
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {lineas.length > 0 && (
              <div className="space-y-1.5 rounded-md border border-line bg-surface-sunken px-4 py-3 text-sm">
                <div className="flex justify-between text-ink-muted">
                  <span>Subtotal</span>
                  <span className="numeric">
                    {money(totales.subtotalCents, business.settings)}
                  </span>
                </div>
                <div className="flex justify-between text-ink-muted">
                  <span>IVA</span>
                  <span className="numeric">
                    {money(totales.taxCents, business.settings)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between border-t border-line pt-1.5">
                  <span className="font-medium text-ink">Total</span>
                  <span className="numeric text-lg font-semibold text-ink">
                    {money(totales.totalCents, business.settings)}
                  </span>
                </div>
              </div>
            )}

            <Field label="Observaciones">
              {(props) => (
                <Textarea
                  {...props}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                />
              )}
            </Field>
          </div>
        </DrawerContent>
      </Drawer>

      {/* --- Cancelar compra --- */}
      <Modal open={voiding !== null} onOpenChange={(open) => !open && setVoiding(null)}>
        {voiding && (
          <ModalContent
            title={`¿Cancelar la compra ${voiding.folio}?`}
            description="La mercancía saldrá del inventario. La compra no se borra: queda registrada como cancelada."
            footer={
              <>
                <Button variant="secondary" onClick={() => setVoiding(null)}>
                  No cancelar
                </Button>
                <Button
                  variant="danger"
                  loading={cancelar.isPending}
                  disabled={voidReason.trim().length < 5}
                  onClick={() => cancelar.mutate(voiding.id)}
                >
                  Cancelar compra
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <p className="flex gap-2 rounded-md border border-warning/20 bg-warning-soft px-3 py-2.5 text-[13px] text-ink">
                <AlertTriangle className="mt-px size-4 shrink-0 text-warning" aria-hidden />
                Si parte de esta mercancía ya se vendió, el sistema rechazará la
                cancelación: sacarla dejaría el inventario en negativo.
              </p>

              <Field label="Motivo" required hint="Quedará en la bitácora con tu nombre.">
                {(props) => (
                  <Textarea
                    {...props}
                    value={voidReason}
                    onChange={(event) => setVoidReason(event.target.value)}
                    placeholder="La factura llegó duplicada del proveedor"
                    rows={2}
                    autoFocus
                  />
                )}
              </Field>
            </div>
          </ModalContent>
        )}
      </Modal>
    </>
  );
}
