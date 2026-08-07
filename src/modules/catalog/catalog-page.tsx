"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useCan } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { type Column, DataTable, Pagination } from "@/components/ui/data-table";
import { Field, Input, Textarea } from "@/components/ui/field";
import {
  ConfirmationDialog,
  Drawer,
  DrawerContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/overlay";
import { EmptyState, PageHeader } from "@/components/ui/surface";
import { ApiError, api, type Paginated } from "@/lib/api";

/**
 * Pantalla genérica de catálogo.
 *
 * Clientes y proveedores comparten exactamente el mismo comportamiento:
 * buscar, listar paginado, crear, editar y borrar lógicamente. Solo cambian
 * los campos y las etiquetas.
 *
 * Es el reflejo en la interfaz de `core/catalog.ts` en el servidor, y por el
 * mismo motivo: cuando haya que corregir algo —el estado vacío, el manejo de
 * errores, la confirmación de borrado— hay un solo sitio donde hacerlo.
 *
 * Igual que en el servidor, la abstracción SE DETIENE aquí: inventario y
 * ventas tienen pantallas propias porque su comportamiento es distinto.
 */

export interface CatalogField {
  name: string;
  label: string;
  /** Ayuda bajo el campo. */
  hint?: string;
  required?: boolean;
  type?: "text" | "email" | "tel" | "textarea";
  placeholder?: string;
  /** Ocupa la fila completa en la rejilla de dos columnas. */
  fullWidth?: boolean;
  /** Se muestra en mayúsculas mientras se escribe (RFC). */
  uppercase?: boolean;
  /** Agrupa el campo bajo un encabezado. */
  group?: string;
}

export interface CatalogPageProps<T extends { id: string; name: string }> {
  title: string;
  description: string;
  /** Ruta de la API sin barra inicial: "customers", "suppliers". */
  resource: string;
  /** Nombre en singular para botones y mensajes: "cliente". */
  singular: string;
  writePermission: string;
  fields: CatalogField[];
  /** Columnas adicionales entre el nombre y las acciones. */
  columns: Column<T>[];
  searchPlaceholder: string;
  emptyIcon: React.ReactNode;
  emptyDescription: string;
  /** Acción extra en el menú de cada fila. */
  rowAction?: {
    label: string;
    icon: React.ReactNode;
    onSelect: (row: T) => void;
  };
  /** Texto de la confirmación de borrado. */
  deleteDescription: (row: T) => string;
}

export function CatalogPage<T extends { id: string; name: string }>({
  title,
  description,
  resource,
  singular,
  writePermission,
  fields,
  columns,
  searchPlaceholder,
  emptyIcon,
  emptyDescription,
  rowAction,
  deleteDescription,
}: CatalogPageProps<T>) {
  const canWrite = useCan(writePermission);
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [page, setPage] = React.useState(1);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<T | null>(null);
  const [deleting, setDeleting] = React.useState<T | null>(null);
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: [resource, { debounced, page }],
    queryFn: () =>
      api.get<Paginated<T>>(`/${resource}`, {
        search: debounced || undefined,
        page,
        pageSize: 25,
      }),
    placeholderData: (previous) => previous,
  });

  function openNew() {
    setEditing(null);
    setForm(Object.fromEntries(fields.map((field) => [field.name, ""])));
    setErrors({});
    setFormOpen(true);
  }

  function openEdit(row: T) {
    setEditing(row);
    setForm(
      Object.fromEntries(
        fields.map((field) => [
          field.name,
          String((row as Record<string, unknown>)[field.name] ?? ""),
        ]),
      ),
    );
    setErrors({});
    setFormOpen(true);
  }

  const save = useMutation({
    mutationFn: () => {
      // Los campos vacíos se envían como null, no como "": el servidor
      // distingue "sin dato" de "cadena vacía", y los índices únicos
      // parciales dependen de ello.
      const payload = Object.fromEntries(
        fields.map((field) => [field.name, form[field.name]?.trim() || null]),
      );

      return editing
        ? api.patch(`/${resource}/${editing.id}`, payload)
        : api.post(`/${resource}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [resource] });
      queryClient.invalidateQueries({ queryKey: ["reference"] });
      toast.success(
        editing
          ? `${capitalize(singular)} actualizado`
          : `${capitalize(singular)} creado`,
      );
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
    mutationFn: (id: string) => api.delete(`/${resource}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [resource] });
      queryClient.invalidateQueries({ queryKey: ["reference"] });
      setDeleting(null);
      toast.success(`${capitalize(singular)} eliminado`);
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError
          ? error.message
          : `No pudimos eliminar el ${singular}.`,
      );
    },
  });

  const allColumns: Column<T>[] = [
    {
      key: "name",
      header: "Nombre",
      cell: (row) => (
        <span className="font-medium text-ink">{row.name}</span>
      ),
    },
    ...columns,
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-12",
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Acciones para ${row.name}`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {rowAction && (
              <DropdownMenuItem onSelect={() => rowAction.onSelect(row)}>
                {rowAction.icon}
                {rowAction.label}
              </DropdownMenuItem>
            )}
            {canWrite && (
              <>
                <DropdownMenuItem onSelect={() => openEdit(row)}>
                  <Pencil />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem tone="danger" onSelect={() => setDeleting(row)}>
                  <Trash2 />
                  Eliminar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  // Agrupación de campos en el formulario, respetando el orden declarado.
  const groups = React.useMemo(() => {
    const map = new Map<string, CatalogField[]>();
    for (const field of fields) {
      const key = field.group ?? "";
      map.set(key, [...(map.get(key) ?? []), field]);
    }
    return [...map.entries()];
  }, [fields]);

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          canWrite && (
            <Button variant="primary" onClick={openNew}>
              <Plus />
              Nuevo {singular}
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
          placeholder={searchPlaceholder}
          aria-label={`Buscar ${title.toLowerCase()}`}
          className="pl-9"
        />
      </div>

      <DataTable
        caption={`Listado de ${title.toLowerCase()}`}
        columns={allColumns}
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        loading={isLoading}
        empty={
          <EmptyState
            icon={emptyIcon}
            title={
              debounced ? "Sin coincidencias" : `Todavía no hay ${title.toLowerCase()}`
            }
            description={
              debounced
                ? `Ningún ${singular} coincide con "${debounced}".`
                : emptyDescription
            }
            action={
              canWrite && !debounced ? (
                <Button variant="primary" size="sm" onClick={openNew}>
                  Crear el primero
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
          title={editing ? `Editar ${singular}` : `Nuevo ${singular}`}
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
                {editing ? "Guardar cambios" : "Crear"}
              </Button>
            </>
          }
        >
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            {groups.map(([groupName, groupFields], groupIndex) => (
              <div
                key={groupName || "principal"}
                className={groupIndex > 0 ? "border-t border-line pt-5" : ""}
              >
                {groupName && (
                  <p className="mb-3 text-[12px] font-medium uppercase tracking-wide text-ink-subtle">
                    {groupName}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {groupFields.map((field, index) => (
                    <Field
                      key={field.name}
                      label={field.label}
                      hint={field.hint}
                      required={field.required}
                      error={errors[field.name]}
                      className={
                        field.fullWidth || field.type === "textarea"
                          ? "col-span-2"
                          : undefined
                      }
                    >
                      {(props) =>
                        field.type === "textarea" ? (
                          <Textarea
                            {...props}
                            value={form[field.name] ?? ""}
                            onChange={(event) =>
                              setForm({ ...form, [field.name]: event.target.value })
                            }
                            placeholder={field.placeholder}
                            rows={2}
                          />
                        ) : (
                          <Input
                            {...props}
                            type={field.type ?? "text"}
                            value={form[field.name] ?? ""}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                [field.name]: field.uppercase
                                  ? event.target.value.toUpperCase()
                                  : event.target.value,
                              })
                            }
                            placeholder={field.placeholder}
                            autoFocus={groupIndex === 0 && index === 0}
                            className={field.uppercase ? "numeric" : undefined}
                          />
                        )
                      }
                    </Field>
                  ))}
                </div>
              </div>
            ))}

            <button type="submit" className="hidden" tabIndex={-1} />
          </form>
        </DrawerContent>
      </Drawer>

      <ConfirmationDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`¿Eliminar a "${deleting?.name}"?`}
        description={deleting ? deleteDescription(deleting) : ""}
        confirmLabel={`Eliminar ${singular}`}
        loading={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
