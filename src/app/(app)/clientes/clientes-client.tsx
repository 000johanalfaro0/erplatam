"use client";

import { useQuery } from "@tanstack/react-query";
import { History, Users } from "lucide-react";
import * as React from "react";

import { useSession } from "@/components/session-provider";
import { Modal, ModalContent } from "@/components/ui/overlay";
import { Badge, EmptyState, Skeleton } from "@/components/ui/surface";
import { Stat } from "@/components/ui/stat";
import { api, type Paginated } from "@/lib/api";
import { dateRelative, money } from "@/lib/format";
import { CatalogPage } from "@/modules/catalog/catalog-page";

/**
 * Clientes (requisito 9).
 *
 * CRM deliberadamente mínimo. Los campos fiscales existen pero son opcionales
 * y van agrupados aparte: pedir el RFC para vender un refresco sería absurdo,
 * pero cuando alguien pide factura hay que poder capturarlo sin salir de aquí.
 *
 * Lo que sí aporta valor real es el historial de compras.
 */

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  rfc: string | null;
  legalName: string | null;
  satRegimenFiscal: string | null;
  satUsoCfdi: string | null;
  satPostalCode: string | null;
  notes: string | null;
}

interface CustomerHistory {
  customer: { id: string; name: string };
  sales: {
    id: string;
    folio: string;
    totalCents: number;
    createdAt: string;
    _count: { items: number };
  }[];
  summary: {
    totalSpentCents: number;
    averageTicketCents: number;
    purchaseCount: number;
    lastPurchaseAt: string | null;
  };
}

export function ClientesClient({
  initialData,
}: {
  initialData: Paginated<Customer>;
}) {
  const [historyFor, setHistoryFor] = React.useState<Customer | null>(null);

  return (
    <>
      <CatalogPage<Customer>
        initialData={initialData}
        title="Clientes"
        description="Quién te compra."
        resource="customers"
        singular="cliente"
        writePermission="customers:write"
        searchPlaceholder="Buscar por nombre, teléfono o RFC…"
        emptyIcon={<Users />}
        emptyDescription="No hace falta registrar a todos. Solo a quienes te piden factura o vuelven seguido."
        fields={[
          {
            name: "name",
            label: "Nombre",
            required: true,
            fullWidth: true,
            placeholder: "María González",
          },
          { name: "phone", label: "Teléfono", type: "tel", placeholder: "55 1234 5678" },
          {
            name: "email",
            label: "Correo",
            type: "email",
            placeholder: "cliente@correo.com",
          },
          { name: "notes", label: "Notas", type: "textarea" },

          // --- Fiscales: agrupados y opcionales ---
          {
            name: "rfc",
            label: "RFC",
            group: "Datos para factura (opcional)",
            uppercase: true,
            placeholder: "GOMA850612QR3",
          },
          {
            name: "satPostalCode",
            label: "Código postal",
            group: "Datos para factura (opcional)",
            placeholder: "64000",
          },
          {
            name: "legalName",
            label: "Razón social",
            group: "Datos para factura (opcional)",
            fullWidth: true,
            hint: "Como aparece en su constancia fiscal",
          },
          {
            name: "satRegimenFiscal",
            label: "Régimen fiscal",
            group: "Datos para factura (opcional)",
            placeholder: "601",
          },
          {
            name: "satUsoCfdi",
            label: "Uso de CFDI",
            group: "Datos para factura (opcional)",
            placeholder: "G03",
          },
        ]}
        columns={[
          {
            key: "phone",
            header: "Teléfono",
            cell: (customer) => (
              <span className="numeric text-[13px] text-ink-muted">
                {customer.phone ?? "—"}
              </span>
            ),
          },
          {
            key: "email",
            header: "Correo",
            hideOnMobile: true,
            cell: (customer) => (
              <span className="text-[13px] text-ink-muted">
                {customer.email ?? "—"}
              </span>
            ),
          },
          {
            key: "rfc",
            header: "Factura",
            hideOnMobile: true,
            cell: (customer) =>
              customer.rfc ? (
                <Badge tone="accent">{customer.rfc}</Badge>
              ) : (
                <span className="text-[13px] text-ink-subtle">—</span>
              ),
          },
        ]}
        rowAction={{
          label: "Ver historial de compras",
          icon: <History />,
          onSelect: (customer) => setHistoryFor(customer),
        }}
        deleteDescription={(customer) =>
          `"${customer.name}" dejará de aparecer al cobrar. Las ventas ya registradas a su nombre se conservan intactas.`
        }
      />

      <CustomerHistoryModal
        customer={historyFor}
        onClose={() => setHistoryFor(null)}
      />
    </>
  );
}

/**
 * Historial de compras.
 *
 * Encabezado con las tres cifras que responden "¿cuánto vale este cliente?":
 * total gastado, ticket promedio y última compra. Es la pregunta real detrás
 * de abrir un historial.
 */
function CustomerHistoryModal({
  customer,
  onClose,
}: {
  customer: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const { formatSettings } = useSession();

  const { data, isLoading } = useQuery({
    queryKey: ["customer-history", customer?.id],
    queryFn: () =>
      api.get<CustomerHistory>(`/customers/${customer!.id}/history`, {
        pageSize: 25,
      }),
    enabled: Boolean(customer),
  });

  if (!customer) return null;

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent
        title={customer.name}
        description="Historial de compras"
        size="lg"
      >
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        ) : !data || data.summary.purchaseCount === 0 ? (
          <EmptyState
            icon={<History />}
            title="Todavía no ha comprado"
            description="Cuando le registres una venta aparecerá aquí."
          />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat
                label="Total gastado"
                value={money(data.summary.totalSpentCents, formatSettings)}
                detail={`${data.summary.purchaseCount} ${data.summary.purchaseCount === 1 ? "compra" : "compras"}`}
              />
              <Stat
                label="Ticket promedio"
                value={money(data.summary.averageTicketCents, formatSettings)}
              />
              <Stat
                label="Última compra"
                value={
                  data.summary.lastPurchaseAt
                    ? dateRelative(data.summary.lastPurchaseAt, formatSettings)
                    : "—"
                }
              />
            </div>

            <ul className="divide-y divide-line rounded-lg border border-line">
              {data.sales.map((sale) => (
                <li
                  key={sale.id}
                  className="flex items-center gap-4 px-4 py-2.5 text-sm"
                >
                  <span className="numeric font-medium text-ink">
                    {sale.folio}
                  </span>
                  <span className="text-[12px] text-ink-subtle">
                    {sale._count.items}{" "}
                    {sale._count.items === 1 ? "producto" : "productos"}
                  </span>
                  <span className="ml-auto text-[12px] text-ink-subtle">
                    {dateRelative(sale.createdAt, formatSettings)}
                  </span>
                  <span className="numeric w-24 text-right font-medium text-ink">
                    {money(sale.totalCents, formatSettings)}
                  </span>
                </li>
              ))}
            </ul>

            <p className="text-[12px] text-ink-subtle">
              Las ventas canceladas no cuentan en el total.
            </p>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
}
