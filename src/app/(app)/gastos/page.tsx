"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MoreHorizontal,
  Pencil,
  Receipt,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useCan, useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { type Column, DataTable, Pagination } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
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
import { Stat } from "@/components/ui/stat";
import { ApiError, api, type Paginated } from "@/lib/api";
import { dateInputValue, dateShort, money } from "@/lib/format";
import { useReference } from "@/lib/queries";

/**
 * Gastos (requisito 8).
 *
 * La cifra que domina la pantalla es el TOTAL de los filtros activos, no el de
 * la página visible. Quien filtra "Renta, este año" quiere saber cuánto suma
 * en total, no cuánto suman los 25 primeros.
 */

interface Expense {
  id: string;
  description: string;
  amountCents: number;
  spentAt: string;
  reference: string | null;
  notes: string | null;
  category: { id: string; name: string; color: string | null } | null;
  method: { id: string; code: string; name: string } | null;
  user: { id: string; name: string };
}

export default function GastosPage() {
  const { business } = useSession();
  const canWrite = useCan("expenses:write");
  const queryClient = useQueryClient();
  const { data: reference } = useReference();

  const emptyForm = React.useMemo(
    () => ({
      description: "",
      amountCents: 0,
      categoryId: "",
      paymentMethodId: "",
      spentAt: dateInputValue(new Date(), business.settings.timezone),
      reference: "",
      notes: "",
    }),
    [business.settings.timezone],
  );

  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [page, setPage] = React.useState(1);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Expense | null>(null);
  const [deleting, setDeleting] = React.useState<Expense | null>(null);
  const [form, setForm] = React.useState(emptyForm);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["expenses", { debounced, categoryId, page }],
    queryFn: () =>
      api.get<Paginated<Expense> & { totalAmountCents: number }>("/expenses", {
        search: debounced || undefined,
        categoryId: categoryId || undefined,
        page,
        pageSize: 25,
      }),
    placeholderData: (previous) => previous,
  });

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setFormOpen(true);
  }

  function openEdit(expense: Expense) {
    setEditing(expense);
    setForm({
      description: expense.description,
      amountCents: expense.amountCents,
      categoryId: expense.category?.id ?? "",
      paymentMethodId: expense.method?.id ?? "",
      spentAt: dateInputValue(expense.spentAt, business.settings.timezone),
      reference: expense.reference ?? "",
      notes: expense.notes ?? "",
    });
    setErrors({});
    setFormOpen(true);
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        description: form.description,
        amountCents: form.amountCents,
        categoryId: form.categoryId || null,
        paymentMethodId: form.paymentMethodId || null,
        // El input date da "YYYY-MM-DD". Se envía como mediodía para que la
        // conversión de zona horaria no lo desplace al día anterior.
        spentAt: new Date(`${form.spentAt}T12:00:00`).toISOString(),
        reference: form.reference || null,
        notes: form.notes || null,
      };

      return editing
        ? api.patch(`/expenses/${editing.id}`, payload)
        : api.post("/expenses", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(editing ? "Gasto actualizado" : "Gasto registrado");
      setFormOpen(false);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        if (Object.keys(error.fieldErrors).length === 0) {
          toast.error(error.message);
        }
      }
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleting(null);
      toast.success("Gasto eliminado");
    },
    onError: () => toast.error("No pudimos eliminar el gasto."),
  });

  const columns: Column<Expense>[] = [
    {
      key: "spentAt",
      header: "Fecha",
      cell: (expense) => (
        <span className="whitespace-nowrap text-ink-muted">
          {dateShort(expense.spentAt, business.settings)}
        </span>
      ),
    },
    {
      key: "description",
      header: "Concepto",
      cell: (expense) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{expense.description}</p>
          {expense.reference && (
            <p className="numeric mt-0.5 truncate text-[12px] text-ink-subtle">
              {expense.reference}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "category",
      header: "Categoría",
      hideOnMobile: true,
      cell: (expense) =>
        expense.category ? (
          <Badge tone="neutral">{expense.category.name}</Badge>
        ) : (
          <span className="text-[13px] text-ink-subtle">Sin categoría</span>
        ),
    },
    {
      key: "method",
      header: "Pago",
      hideOnMobile: true,
      cell: (expense) => (
        <span className="text-[13px] text-ink-muted">
          {expense.method?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "user",
      header: "Registró",
      hideOnMobile: true,
      cell: (expense) => (
        <span className="text-[13px] text-ink-muted">{expense.user.name}</span>
      ),
    },
    {
      key: "amountCents",
      header: "Importe",
      align: "right",
      cell: (expense) => (
        <span className="font-medium text-ink">
          {money(expense.amountCents, business.settings)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-12",
      cell: (expense) =>
        canWrite ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Acciones para ${expense.description}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => openEdit(expense)}>
                <Pencil />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                tone="danger"
                onSelect={() => setDeleting(expense)}
              >
                <Trash2 />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  const hasFilters = Boolean(debounced || categoryId);

  return (
    <>
      <PageHeader
        title="Gastos"
        description="Todo lo que sale y no es mercancía."
        actions={
          canWrite && (
            <Button variant="primary" onClick={openNew}>
              <Wallet />
              Registrar gasto
            </Button>
          )
        }
      />

      {/* El total de los FILTROS, no de la página visible. */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:max-w-xs">
        <Stat
          label={hasFilters ? "Total filtrado" : "Total registrado"}
          value={money(data?.totalAmountCents ?? 0, business.settings)}
          detail={`${data?.total ?? 0} ${(data?.total ?? 0) === 1 ? "gasto" : "gastos"}`}
          higherIsBetter={false}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por concepto o referencia…"
            aria-label="Buscar gastos"
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
          className="w-auto min-w-44"
        >
          <option value="">Todas las categorías</option>
          {reference?.expenseCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        caption="Listado de gastos"
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(expense) => expense.id}
        loading={isLoading}
        empty={
          <EmptyState
            icon={<Receipt />}
            title={hasFilters ? "Sin coincidencias" : "Todavía no hay gastos"}
            description={
              hasFilters
                ? "Ningún gasto coincide con estos filtros."
                : "Sin registrar gastos, el sistema te mostrará ingresos y creerás que son ganancia."
            }
            action={
              canWrite && !hasFilters ? (
                <Button variant="primary" size="sm" onClick={openNew}>
                  Registrar el primero
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

      <Drawer open={formOpen} onOpenChange={setFormOpen}>
        <DrawerContent
          title={editing ? "Editar gasto" : "Registrar gasto"}
          description={
            editing
              ? "Cambiar el importe altera la utilidad reportada del mes."
              : undefined
          }
          width="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                loading={save.isPending}
                onClick={() => save.mutate()}
              >
                {editing ? "Guardar cambios" : "Registrar"}
              </Button>
            </>
          }
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Concepto" required error={errors.description}>
              {(props) => (
                <Input
                  {...props}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="Renta del local, agosto"
                  autoFocus
                />
              )}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Importe" required error={errors.amountCents}>
                {(props) => (
                  <MoneyInput
                    {...props}
                    valueCents={form.amountCents}
                    onValueChange={(cents) =>
                      setForm({ ...form, amountCents: cents })
                    }
                  />
                )}
              </Field>

              <Field
                label="Fecha del gasto"
                hint="Puede ser anterior a hoy"
                error={errors.spentAt}
              >
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    value={form.spentAt}
                    onChange={(event) =>
                      setForm({ ...form, spentAt: event.target.value })
                    }
                  />
                )}
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoría" error={errors.categoryId}>
                {(props) => (
                  <Select
                    {...props}
                    value={form.categoryId}
                    onChange={(event) =>
                      setForm({ ...form, categoryId: event.target.value })
                    }
                  >
                    <option value="">Sin categoría</option>
                    {reference?.expenseCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="¿Cómo lo pagaste?" error={errors.paymentMethodId}>
                {(props) => (
                  <Select
                    {...props}
                    value={form.paymentMethodId}
                    onChange={(event) =>
                      setForm({ ...form, paymentMethodId: event.target.value })
                    }
                  >
                    <option value="">Sin especificar</option>
                    {reference?.paymentMethods.map((method) => (
                      <option key={method.id} value={method.id}>
                        {method.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>

            <Field
              label="Referencia"
              hint="Folio del recibo, número de transferencia…"
              error={errors.reference}
            >
              {(props) => (
                <Input
                  {...props}
                  value={form.reference}
                  onChange={(event) =>
                    setForm({ ...form, reference: event.target.value })
                  }
                  placeholder="SPEI-99231"
                  className="numeric"
                />
              )}
            </Field>

            <Field label="Notas" error={errors.notes}>
              {(props) => (
                <Textarea
                  {...props}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                  rows={2}
                />
              )}
            </Field>

            <button type="submit" className="hidden" tabIndex={-1} />
          </form>
        </DrawerContent>
      </Drawer>

      <ConfirmationDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="¿Eliminar este gasto?"
        description={`"${deleting?.description}" dejará de contar en los reportes y en la ganancia estimada. Queda registrado en la bitácora quién lo eliminó.`}
        confirmLabel="Eliminar gasto"
        loading={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </>
  );
}
