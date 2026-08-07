"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Receipt, Search, ShieldCheck } from "lucide-react";
import * as React from "react";

import { useSession } from "@/components/session-provider";
import { type Column, DataTable, Pagination } from "@/components/ui/data-table";
import { Input, Select } from "@/components/ui/field";
import { Modal, ModalContent } from "@/components/ui/overlay";
import { Badge, EmptyState, PageHeader } from "@/components/ui/surface";
import { api, type Paginated } from "@/lib/api";
import { SENSITIVE_ACTIONS, describeAuditAction } from "@/lib/audit-labels";
import { dateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Bitácora de auditoría (requisito 14).
 *
 * Solo lectura, sin excepciones. No hay forma de crear ni de borrar entradas
 * desde la interfaz ni desde la API: la bitácora se escribe únicamente desde
 * dentro de las transacciones que audita.
 *
 * Las acciones SENSIBLES —cancelar una venta, ajustar inventario, eliminar un
 * producto, accesos fallidos— se resaltan. Son las operaciones con las que se
 * roba en un negocio, y deben saltar a la vista al revisar.
 */

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userName: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
}

interface AuditResponse extends Paginated<AuditEntry> {
  filtros: {
    usuarios: { id: string; name: string }[];
    acciones: { action: string; count: number }[];
  };
}

export function AuditoriaClient({
  initialData,
}: {
  initialData: AuditResponse;
}) {
  const { formatSettings } = useSession();

  const [userId, setUserId] = React.useState("");
  const [action, setAction] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [detail, setDetail] = React.useState<AuditEntry | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["audit", { userId, action, debounced, page }],
    queryFn: () =>
      api.get<AuditResponse>("/audit", {
        userId: userId || undefined,
        action: action || undefined,
        search: debounced || undefined,
        page,
        pageSize: 50,
      }),
    placeholderData: (previous) => previous,
    /*
     * Primera carga resuelta en el servidor. Solo sin filtros y en la primera
     * página: la clave de consulta incluye usuario, acción y búsqueda, y sin
     * la condición se mostrarían estos mismos registros al filtrar por
     * cualquier otra cosa.
     */
    initialData:
      !userId && !action && !debounced && page === 1
        ? initialData
        : undefined,
  });

  const columns: Column<AuditEntry>[] = [
    {
      key: "createdAt",
      header: "Cuándo",
      cell: (entry) => (
        <div className="min-w-0 whitespace-nowrap">
          <p className="text-[13px] text-ink">
            {dateTime(entry.createdAt, formatSettings)}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-subtle">
            {timeAgo(entry.createdAt)}
          </p>
        </div>
      ),
    },
    {
      key: "userName",
      header: "Quién",
      cell: (entry) => (
        <span className="text-[13px] text-ink">
          {entry.userName ?? "Sistema"}
        </span>
      ),
    },
    {
      key: "action",
      header: "Qué hizo",
      cell: (entry) => {
        const sensible = SENSITIVE_ACTIONS.has(entry.action);
        return (
          <span className="flex items-center gap-1.5">
            {sensible && (
              <AlertTriangle
                className="size-3.5 shrink-0 text-warning"
                aria-label="Acción sensible"
              />
            )}
            <span
              className={cn(
                "text-[13px]",
                sensible ? "font-medium text-ink" : "text-ink-muted",
              )}
            >
              {describeAuditAction(entry.action)}
            </span>
          </span>
        );
      },
    },
    {
      key: "entityType",
      header: "Sobre",
      hideOnMobile: true,
      cell: (entry) => (
        <Badge tone="neutral">{ENTITY_LABELS[entry.entityType] ?? entry.entityType}</Badge>
      ),
    },
    {
      key: "ip",
      header: "Desde",
      hideOnMobile: true,
      cell: (entry) => (
        <span className="numeric text-[12px] text-ink-subtle">
          {entry.ip ?? "—"}
        </span>
      ),
    },
  ];

  const hasFilters = Boolean(userId || action || debounced);

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Registro de todo lo que pasó. No se puede modificar ni borrar."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre…"
            aria-label="Buscar en la bitácora"
            className="pl-9"
          />
        </div>

        <Select
          value={userId}
          onChange={(event) => {
            setUserId(event.target.value);
            setPage(1);
          }}
          aria-label="Filtrar por usuario"
          className="w-auto min-w-40"
        >
          <option value="">Todos los usuarios</option>
          {data?.filtros.usuarios.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </Select>

        <Select
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(1);
          }}
          aria-label="Filtrar por acción"
          className="w-auto min-w-52"
        >
          <option value="">Todas las acciones</option>
          {data?.filtros.acciones.map((item) => (
            <option key={item.action} value={item.action}>
              {describeAuditAction(item.action)} ({item.count})
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        caption="Bitácora de auditoría"
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(entry) => entry.id}
        loading={isLoading}
        onRowClick={(entry) => setDetail(entry)}
        rowTone={(entry) =>
          SENSITIVE_ACTIONS.has(entry.action) ? "warning" : "default"
        }
        empty={
          <EmptyState
            icon={<ShieldCheck />}
            title={hasFilters ? "Sin coincidencias" : "La bitácora está vacía"}
            description={
              hasFilters
                ? "Ninguna entrada coincide con estos filtros."
                : "Aquí aparecerá cada operación importante con quién la hizo y cuándo."
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

      <p className="mt-4 flex items-center gap-1.5 text-[12px] text-ink-subtle">
        <AlertTriangle className="size-3 text-warning" aria-hidden />
        Las filas resaltadas son operaciones sensibles: cancelaciones, ajustes
        de inventario, eliminaciones y accesos fallidos.
      </p>

      {/* --- Detalle --- */}
      <Modal open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        {detail && (
          <ModalContent
            title={describeAuditAction(detail.action)}
            description={`${detail.userName ?? "Sistema"} · ${dateTime(detail.createdAt, formatSettings)}`}
            size="lg"
          >
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 rounded-md border border-line bg-surface-sunken p-3 text-[12px]">
                <div>
                  <dt className="text-ink-subtle">Verbo técnico</dt>
                  <dd className="numeric mt-0.5 text-ink">{detail.action}</dd>
                </div>
                <div>
                  <dt className="text-ink-subtle">Entidad</dt>
                  <dd className="mt-0.5 text-ink">
                    {ENTITY_LABELS[detail.entityType] ?? detail.entityType}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-subtle">Dirección IP</dt>
                  <dd className="numeric mt-0.5 text-ink">{detail.ip ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-ink-subtle">Identificador</dt>
                  <dd className="numeric mt-0.5 truncate text-ink">
                    {detail.entityId ?? "—"}
                  </dd>
                </div>
              </dl>

              {Boolean(detail.metadata) && (
                <Bloque titulo="Detalle" data={detail.metadata} />
              )}

              {/* Antes y después solo se muestran si hubo cambio real: el
                  servidor solo guarda los campos que cambiaron. */}
              {Boolean(detail.before) && (
                <Bloque titulo="Antes" data={detail.before} tone="danger" />
              )}
              {Boolean(detail.after) && (
                <Bloque titulo="Después" data={detail.after} tone="positive" />
              )}
            </div>
          </ModalContent>
        )}
      </Modal>
    </>
  );
}

function Bloque({
  titulo,
  data,
  tone,
}: {
  titulo: string;
  data: unknown;
  tone?: "danger" | "positive";
}) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-ink-muted">{titulo}</p>
      <pre
        className={cn(
          "scroll-slim overflow-x-auto rounded-md border p-3 text-[12px] leading-relaxed",
          tone === "danger"
            ? "border-danger/15 bg-danger-soft text-ink"
            : tone === "positive"
              ? "border-positive/15 bg-positive-soft text-ink"
              : "border-line bg-surface-sunken text-ink",
        )}
      >
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

const ENTITY_LABELS: Record<string, string> = {
  Sale: "Venta",
  Purchase: "Compra",
  Product: "Producto",
  Expense: "Gasto",
  User: "Usuario",
  customer: "Cliente",
  supplier: "Proveedor",
  category: "Categoría",
  expenseCategory: "Categoría de gasto",
  FeedbackItem: "Anotación",
  DiscoveryResponse: "Cuestionario",
  InventoryMovement: "Movimiento",
};
