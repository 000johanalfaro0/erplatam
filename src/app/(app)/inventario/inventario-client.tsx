"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  MoreHorizontal,
  Package,
  PackagePlus,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useCan, useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { type Column, DataTable, Pagination } from "@/components/ui/data-table";
import { Input, Select } from "@/components/ui/field";
import {
  ConfirmationDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/overlay";
import { ExportButton } from "@/components/export-button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/surface";
import { ApiError, api, type Paginated } from "@/lib/api";
import { money, quantity } from "@/lib/format";
import {
  type Product,
  useProducts,
  useReference,
} from "@/lib/queries";
import { StockMovementDialog } from "@/modules/inventory/stock-movement-dialog";
import { ProductFormDrawer } from "@/modules/products/product-form";

/**
 * Inventario: catálogo de productos con su existencia.
 *
 * Es la pantalla que más se consulta después del punto de venta, así que
 * prioriza densidad de información y búsqueda rápida por encima de adornos.
 *
 * El filtro de "stock bajo" es la vista más útil de todo el módulo: responde a
 * "¿qué tengo que pedir hoy?", que es la pregunta real del encargado.
 */
export function InventarioClient({
  initialData,
}: {
  initialData: Paginated<Product>;
}) {
  const { business } = useSession();
  const canWrite = useCan("products:write");
  const canDelete = useCan("products:delete");
  const canAdjust = useCan("inventory:adjust");
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [lowStock, setLowStock] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [sort, setSort] = React.useState<{
    key: string;
    direction: "asc" | "desc";
  }>({ key: "name", direction: "asc" });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [movementProduct, setMovementProduct] = React.useState<Product | null>(null);
  const [deleting, setDeleting] = React.useState<Product | null>(null);

  // Retardo en el buscador: sin él, cada tecla lanzaría una petición.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: reference } = useReference();
  const { data, isLoading } = useProducts(
    {
    search: debouncedSearch || undefined,
    categoryId: categoryId || undefined,
    lowStock: lowStock || undefined,
    page,
    pageSize: 25,
    sortBy: sort.key,
      sortDir: sort.direction,
    },
    // Los datos de la primera carga vienen del servidor, dentro del mismo
    // viaje que la página. Sin esto habría un segundo viaje solo para
    // pedirlos, y el usuario vería un esqueleto durante ~300 ms.
    initialData,
  );

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      const name = deleting?.name ?? "El producto";
      setDeleting(null);
      toast.success(`"${name}" eliminado del catálogo`, {
        description: "Las ventas históricas lo conservan intacto.",
      });
      void id;
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "No pudimos eliminar el producto.",
      );
    },
  });

  /** Umbral efectivo: el del producto, o el global si no tiene. */
  function isLow(product: Product): boolean {
    if (!product.tracksInventory) return false;
    const threshold = product.minStock ?? business.settings.lowStockThreshold;
    return product.stock <= threshold;
  }

  const columns: Column<Product>[] = [
    {
      key: "name",
      header: "Producto",
      sortable: true,
      cell: (product) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{product.name}</p>
          <p className="numeric mt-0.5 truncate text-[12px] text-ink-subtle">
            {product.sku}
            {product.category && ` · ${product.category.name}`}
          </p>
        </div>
      ),
    },
    {
      key: "stock",
      header: "Existencia",
      align: "right",
      sortable: true,
      cell: (product) => {
        if (!product.tracksInventory) {
          return <span className="text-[13px] text-ink-subtle">—</span>;
        }

        const low = isLow(product);
        return (
          <span
            className={
              product.stock <= 0
                ? "font-medium text-danger"
                : low
                  ? "font-medium text-warning"
                  : "text-ink"
            }
          >
            {quantity(product.stock)}
            {low && (
              <AlertTriangle
                className="ml-1 inline size-3 align-[-1px]"
                aria-label="Existencia baja"
              />
            )}
          </span>
        );
      },
    },
    {
      key: "priceCents",
      header: "Precio",
      align: "right",
      sortable: true,
      cell: (product) => money(product.priceCents, business.settings),
    },
    {
      key: "costCents",
      header: "Costo",
      align: "right",
      hideOnMobile: true,
      cell: (product) => (
        <span className="text-ink-muted">
          {money(product.costCents, business.settings)}
        </span>
      ),
    },
    {
      key: "taxRate",
      header: "Impuesto",
      hideOnMobile: true,
      cell: (product) =>
        product.taxRate ? (
          <span className="text-[13px] text-ink-muted">
            {product.taxRate.name}
          </span>
        ) : (
          <span className="text-[13px] text-ink-subtle">—</span>
        ),
    },
    {
      key: "status",
      header: "Estado",
      hideOnMobile: true,
      cell: (product) =>
        product.status === "ACTIVE" ? (
          <Badge tone="positive">Activo</Badge>
        ) : (
          <Badge tone="neutral">Inactivo</Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-12",
      cell: (product) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Acciones para ${product.name}`}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canWrite && (
              <DropdownMenuItem
                onSelect={() => {
                  setEditingId(product.id);
                  setFormOpen(true);
                }}
              >
                <Pencil />
                Editar
              </DropdownMenuItem>
            )}
            {canAdjust && product.tracksInventory && (
              <DropdownMenuItem onSelect={() => setMovementProduct(product)}>
                <PackagePlus />
                Mover existencia
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem
                tone="danger"
                onSelect={() => setDeleting(product)}
              >
                <Trash2 />
                Eliminar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const hasFilters = Boolean(debouncedSearch || categoryId || lowStock);

  return (
    <>
      <PageHeader
        title="Inventario"
        description="Catálogo de productos y existencias."
        actions={
          <>
            <ExportButton
              endpoint="/products/export"
              filtros={{
                search: debouncedSearch,
                categoryId,
                lowStock: lowStock || undefined,
              }}
            />
            {canWrite && (
              <Button
                variant="primary"
                onClick={() => {
                  setEditingId(null);
                  setFormOpen(true);
                }}
              >
                <Package />
                Nuevo producto
              </Button>
            )}
          </>
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
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, SKU o código…"
            aria-label="Buscar productos"
            className="pl-9"
          />
        </div>

        <Select
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setPage(1);
          }}
          aria-label="Filtrar por categoría"
          className="w-auto min-w-40"
        >
          <option value="">Todas las categorías</option>
          {reference?.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>

        <Button
          variant={lowStock ? "primary" : "secondary"}
          onClick={() => {
            setLowStock((value) => !value);
            setPage(1);
          }}
          aria-pressed={lowStock}
        >
          <SlidersHorizontal />
          Solo stock bajo
        </Button>
      </div>

      <DataTable
        caption="Listado de productos"
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(product) => product.id}
        loading={isLoading}
        sort={sort}
        onSortChange={setSort}
        rowTone={(product) =>
          product.status !== "ACTIVE"
            ? "muted"
            : product.stock <= 0 && product.tracksInventory
              ? "danger"
              : isLow(product)
                ? "warning"
                : "default"
        }
        empty={
          hasFilters ? (
            <EmptyState
              icon={<Search />}
              title="Sin coincidencias"
              description="Ningún producto coincide con estos filtros."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setCategoryId("");
                    setLowStock(false);
                  }}
                >
                  Limpiar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Package />}
              title="Todavía no hay productos"
              description="Da de alta tu primer producto para empezar a vender."
              action={
                canWrite && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setEditingId(null);
                      setFormOpen(true);
                    }}
                  >
                    Crear el primer producto
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

      <ProductFormDrawer
        open={formOpen}
        onOpenChange={setFormOpen}
        productId={editingId}
      />

      <StockMovementDialog
        product={movementProduct}
        onClose={() => setMovementProduct(null)}
      />

      <ConfirmationDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`¿Eliminar "${deleting?.name}"?`}
        description="El producto dejará de aparecer en el catálogo y no se podrá vender. Las ventas y compras ya registradas lo conservan intacto, así que el histórico no se altera."
        confirmLabel="Eliminar producto"
        loading={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </>
  );
}
