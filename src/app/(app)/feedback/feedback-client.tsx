"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bug,
  Lightbulb,
  MessageSquare,
  MessageSquareDot,
  Monitor,
  SquarePlus,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useCan, useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Modal, ModalContent } from "@/components/ui/overlay";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
} from "@/components/ui/surface";
import { api, type Paginated } from "@/lib/api";
import { dateRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Bandeja de feedback (requisito 21).
 *
 * Organizada por ESTADO en pestañas, no como una lista plana: revisar
 * feedback es un flujo de trabajo — llega, se revisa, se aprueba o se
 * descarta, se implementa. Ver todo mezclado hace imposible saber qué falta
 * por atender.
 *
 * Dentro de cada estado se ordena por prioridad. Lo urgente arriba.
 */

interface FeedbackItem {
  id: string;
  kind: "COMMENT" | "NEW_ELEMENT" | "BUG" | "IDEA";
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: "PENDING" | "REVIEWING" | "APPROVED" | "IMPLEMENTED" | "DISCARDED";
  title: string;
  description: string | null;
  route: string;
  elementLabel: string | null;
  proposedElement: string | null;
  internalNotes: string | null;
  viewportWidth: number | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  screenshot: { id: string; sizeBytes: number; mimeType: string } | null;
}

const STATUS_TABS = [
  { value: "PENDING", label: "Pendiente" },
  { value: "REVIEWING", label: "Revisando" },
  { value: "APPROVED", label: "Aprobado" },
  { value: "IMPLEMENTED", label: "Implementado" },
  { value: "DISCARDED", label: "Descartado" },
] as const;

const KIND_META = {
  COMMENT: { icon: MessageSquare, label: "Comentario" },
  NEW_ELEMENT: { icon: SquarePlus, label: "Propuesta" },
  BUG: { icon: Bug, label: "Error" },
  IDEA: { icon: Lightbulb, label: "Idea" },
} as const;

const PRIORITY_META = {
  HIGH: { tone: "danger", label: "Alta" },
  MEDIUM: { tone: "warning", label: "Media" },
  LOW: { tone: "neutral", label: "Baja" },
} as const;

export function FeedbackClient({
  initialData,
}: {
  initialData: Paginated<FeedbackItem> & { counts: Record<string, number> };
}) {
  const { formatSettings } = useSession();
  const canManage = useCan("feedback:manage");
  const queryClient = useQueryClient();

  const [status, setStatus] = React.useState<string>("PENDING");
  const [selected, setSelected] = React.useState<FeedbackItem | null>(null);
  const [notes, setNotes] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["feedback", status],
    queryFn: () =>
      api.get<Paginated<FeedbackItem> & { counts: Record<string, number> }>(
        "/feedback",
        { status, pageSize: 50 },
      ),
    /*
     * Primera carga resuelta en el servidor. Solo aplica a la pestaña por
     * defecto: la clave de consulta incluye el estado, y sin la condición
     * TanStack Query mostraría las anotaciones pendientes al abrir cualquier
     * otra pestaña.
     */
    initialData: status === "PENDING" ? initialData : undefined,
  });

  const update = useMutation({
    mutationFn: (input: {
      id: string;
      status?: string;
      priority?: string;
      internalNotes?: string;
    }) => api.patch(`/feedback/${input.id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      toast.success("Anotación actualizada");
      setSelected(null);
    },
    onError: () => toast.error("No pudimos actualizar la anotación."),
  });

  const items = data?.items ?? [];
  const counts = data?.counts ?? {};

  return (
    <>
      <PageHeader
        title="Feedback"
        description="Anotaciones que se dejaron directamente sobre la interfaz."
      />

      {/* --- Pestañas por estado --- */}
      <div
        role="tablist"
        aria-label="Estado del feedback"
        className="mb-4 flex flex-wrap gap-1 border-b border-line"
      >
        {STATUS_TABS.map((tab) => {
          const activo = status === tab.value;
          const count = counts[tab.value] ?? 0;

          return (
            <button
              key={tab.value}
              role="tab"
              aria-selected={activo}
              onClick={() => setStatus(tab.value)}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors",
                activo
                  ? "border-accent font-medium text-accent"
                  : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={cn(
                    "numeric rounded-full px-1.5 text-[11px]",
                    activo
                      ? "bg-accent-soft text-accent"
                      : "bg-surface-sunken text-ink-subtle",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MessageSquareDot />}
            title="Sin anotaciones en este estado"
            description="Activa el Modo feedback desde cualquier pantalla y haz clic derecho sobre lo que quieras comentar."
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const Icon = KIND_META[item.kind].icon;
            const prioridad = PRIORITY_META[item.priority];

            return (
              <button
                key={item.id}
                onClick={() => {
                  setSelected(item);
                  setNotes(item.internalNotes ?? "");
                }}
                className="flex flex-col rounded-lg border border-line bg-surface p-4 text-left shadow-subtle transition-colors hover:border-line-strong hover:bg-surface-sunken"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Icon className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                  <span className="text-[11px] text-ink-subtle">
                    {KIND_META[item.kind].label}
                  </span>
                  <Badge tone={prioridad.tone} className="ml-auto">
                    {prioridad.label}
                  </Badge>
                </div>

                <p className="line-clamp-2 text-[13.5px] font-medium text-ink">
                  {item.title}
                </p>

                {item.description && (
                  <p className="mt-1 line-clamp-2 text-[12px] text-ink-muted">
                    {item.description}
                  </p>
                )}

                {item.screenshot && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`/api/v1/feedback/${item.id}/screenshot`}
                    alt=""
                    className="mt-3 h-24 w-full rounded-sm border border-line object-cover object-top"
                    loading="lazy"
                  />
                )}

                <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5 text-[11px] text-ink-subtle">
                  <Monitor className="size-3 shrink-0" aria-hidden />
                  <span className="truncate font-mono">{item.route}</span>
                  <span className="ml-auto shrink-0">
                    {dateRelative(item.createdAt, formatSettings)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* --- Detalle --- */}
      <Modal
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        {selected && (
          <ModalContent
            title={selected.title}
            description={`${KIND_META[selected.kind].label} · ${selected.route}`}
            size="lg"
            footer={
              canManage ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      update.mutate({
                        id: selected.id,
                        status: "DISCARDED",
                        internalNotes: notes,
                      })
                    }
                    loading={update.isPending}
                  >
                    Descartar
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() =>
                      update.mutate({
                        id: selected.id,
                        status:
                          selected.status === "PENDING"
                            ? "REVIEWING"
                            : selected.status === "REVIEWING"
                              ? "APPROVED"
                              : "IMPLEMENTED",
                        internalNotes: notes,
                      })
                    }
                    loading={update.isPending}
                  >
                    {selected.status === "PENDING"
                      ? "Marcar en revisión"
                      : selected.status === "REVIEWING"
                        ? "Aprobar"
                        : "Marcar implementado"}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" onClick={() => setSelected(null)}>
                  Cerrar
                </Button>
              )
            }
          >
            <div className="space-y-4">
              {selected.description && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                  {selected.description}
                </p>
              )}

              <dl className="grid grid-cols-2 gap-3 rounded-md border border-line bg-surface-sunken p-3 text-[12px]">
                {selected.elementLabel && (
                  <div className="col-span-2">
                    <dt className="text-ink-subtle">Elemento señalado</dt>
                    <dd className="mt-0.5 text-ink">{selected.elementLabel}</dd>
                  </div>
                )}
                {selected.proposedElement && (
                  <div>
                    <dt className="text-ink-subtle">Propone</dt>
                    <dd className="mt-0.5 text-ink">
                      {selected.proposedElement}
                    </dd>
                  </div>
                )}
                {selected.viewportWidth && (
                  <div>
                    <dt className="text-ink-subtle">Ancho de pantalla</dt>
                    <dd className="numeric mt-0.5 text-ink">
                      {selected.viewportWidth} px
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-ink-subtle">Quién lo anotó</dt>
                  <dd className="mt-0.5 text-ink">
                    {selected.createdBy?.name ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-subtle">Cuándo</dt>
                  <dd className="mt-0.5 text-ink">
                    {dateRelative(selected.createdAt, formatSettings)}
                  </dd>
                </div>
              </dl>

              {selected.screenshot && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`/api/v1/feedback/${selected.id}/screenshot`}
                  alt={`Captura de la pantalla ${selected.route}`}
                  className="w-full rounded-md border border-line"
                />
              )}

              {canManage && (
                <div className="space-y-3 border-t border-line pt-4">
                  <div>
                    <label
                      htmlFor="notas-internas"
                      className="mb-1.5 block text-[13px] font-medium text-ink-muted"
                    >
                      Notas internas
                    </label>
                    <Textarea
                      id="notas-internas"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Estimación, decisión técnica, por qué se descarta…"
                      rows={3}
                    />
                    <p className="mt-1 text-[12px] text-ink-subtle">
                      Solo las ve el equipo, nunca el cliente.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="prioridad"
                      className="mb-1.5 block text-[13px] font-medium text-ink-muted"
                    >
                      Prioridad
                    </label>
                    <Select
                      id="prioridad"
                      value={selected.priority}
                      onChange={(event) =>
                        update.mutate({
                          id: selected.id,
                          priority: event.target.value,
                        })
                      }
                    >
                      <option value="HIGH">Alta</option>
                      <option value="MEDIUM">Media</option>
                      <option value="LOW">Baja</option>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </ModalContent>
        )}
      </Modal>
    </>
  );
}
