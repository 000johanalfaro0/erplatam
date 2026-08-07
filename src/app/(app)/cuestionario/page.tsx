"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardList, Info, Save } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  PageHeader,
  Skeleton,
} from "@/components/ui/surface";
import {
  DISCOVERY_FORM_VERSION,
  DISCOVERY_SECTIONS,
  ALL_QUESTIONS,
  type DiscoveryQuestion,
} from "@/config/discovery";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * "Configuración y análisis del negocio" (requisito 19).
 *
 * DECISIONES DE EXPERIENCIA:
 *
 *   - Se guarda solo, sin pulsar nada. El cuestionario se contesta a ratos
 *     entre clientes; perder lo escrito porque sonó el teléfono sería
 *     inaceptable.
 *   - Las preguntas están en el lenguaje del dueño, no en el nuestro. "¿Se te
 *     cae el internet con frecuencia?" en lugar de "¿requiere capacidad
 *     offline?".
 *   - El porqué técnico de cada pregunta se muestra SOLO al equipo, no al
 *     cliente: a él no le aporta y le distrae.
 */

type Answers = Record<string, string | number | boolean | string[] | null>;

export default function ConfiguracionPage() {
  const { business, user } = useSession();
  const queryClient = useQueryClient();

  const [answers, setAnswers] = React.useState<Answers>({});
  const [showRationale, setShowRationale] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["discovery", DISCOVERY_FORM_VERSION],
    queryFn: () =>
      api.get<{
        answers: Answers;
        completedAt: string | null;
      } | null>("/discovery", { formVersion: DISCOVERY_FORM_VERSION }),
  });

  React.useEffect(() => {
    if (data?.answers) setAnswers(data.answers);
  }, [data]);

  const save = useMutation({
    mutationFn: (completed: boolean) =>
      api.put("/discovery", {
        formVersion: DISCOVERY_FORM_VERSION,
        answers,
        completed,
      }),
    onSuccess: (_result, completed) => {
      queryClient.invalidateQueries({ queryKey: ["discovery"] });
      setDirty(false);
      if (completed) {
        toast.success("Cuestionario enviado", {
          description: "Gracias. Esto nos ayuda a dimensionar bien el sistema.",
        });
      }
    },
    onError: () => toast.error("No pudimos guardar las respuestas."),
  });

  /**
   * Guardado automático con retardo.
   *
   * Dos segundos tras dejar de escribir. Suficiente para no lanzar una
   * petición por tecla, y lo bastante corto para que nadie pierda trabajo.
   */
  React.useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => save.mutate(false), 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, dirty]);

  function setAnswer(id: string, value: Answers[string]) {
    setAnswers((current) => ({ ...current, [id]: value }));
    setDirty(true);
  }

  const respondidas = ALL_QUESTIONS.filter((q) => {
    const value = answers[q.id];
    return value !== undefined && value !== null && value !== "" &&
      !(Array.isArray(value) && value.length === 0);
  }).length;

  const obligatoriasPendientes = ALL_QUESTIONS.filter((q) => {
    if (!q.required) return false;
    const value = answers[q.id];
    return value === undefined || value === null || value === "" ||
      (Array.isArray(value) && value.length === 0);
  });

  const progreso = Math.round((respondidas / ALL_QUESTIONS.length) * 100);
  const completado = Boolean(data?.completedAt);

  return (
    <>
      <PageHeader
        title="Configuración y análisis del negocio"
        description="Cuéntanos cómo trabajas para que el sistema se ajuste a ti."
        actions={
          <div className="flex items-center gap-2">
            {/* El porqué técnico solo lo ve el equipo. */}
            {user.role.key === "ADMIN" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRationale((value) => !value)}
                aria-pressed={showRationale}
              >
                <Info />
                {showRationale ? "Ocultar" : "Ver"} el porqué técnico
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => save.mutate(true)}
              loading={save.isPending}
              disabled={obligatoriasPendientes.length > 0}
            >
              {completado ? <Check /> : <Save />}
              {completado ? "Guardado" : "Enviar cuestionario"}
            </Button>
          </div>
        }
      />

      {/* --- Progreso --- */}
      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-center gap-4">
          <div className="min-w-40 flex-1">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[13px] font-medium text-ink">
                {respondidas} de {ALL_QUESTIONS.length} preguntas
              </span>
              <span className="numeric text-[13px] text-ink-muted">
                {progreso}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progreso}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progreso del cuestionario"
              className="h-1.5 overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300"
                style={{ width: `${progreso}%` }}
              />
            </div>
          </div>

          {completado ? (
            <Badge tone="positive">
              <Check className="size-3" aria-hidden />
              Enviado
            </Badge>
          ) : obligatoriasPendientes.length > 0 ? (
            <span className="text-[12px] text-ink-subtle">
              Faltan {obligatoriasPendientes.length} obligatorias
            </span>
          ) : (
            <Badge tone="accent">Listo para enviar</Badge>
          )}

          <span
            className="text-[12px] text-ink-subtle"
            aria-live="polite"
          >
            {save.isPending
              ? "Guardando…"
              : dirty
                ? "Cambios sin guardar"
                : "Se guarda solo"}
          </span>
        </CardBody>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-64 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {DISCOVERY_SECTIONS.map((section) => (
            <Card key={section.id}>
              <CardHeader className="block">
                <CardTitle>{section.title}</CardTitle>
                <p className="mt-0.5 text-[13px] text-ink-muted">
                  {section.description}
                </p>
              </CardHeader>

              <CardBody className="space-y-5">
                {section.questions.map((question) => (
                  <QuestionField
                    key={question.id}
                    question={question}
                    value={answers[question.id]}
                    onChange={(value) => setAnswer(question.id, value)}
                    showRationale={showRationale}
                  />
                ))}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-[12px] text-ink-subtle">
        Negocio: {business.name} · Formulario versión {DISCOVERY_FORM_VERSION}
      </p>
    </>
  );
}

function QuestionField({
  question,
  value,
  onChange,
  showRationale,
}: {
  question: DiscoveryQuestion;
  value: Answers[string];
  onChange: (value: Answers[string]) => void;
  showRationale: boolean;
}) {
  const seleccionadas = Array.isArray(value) ? value : [];

  return (
    <div>
      {question.type === "multiselect" ? (
        <fieldset>
          <legend className="text-[13px] font-medium text-ink-muted">
            {question.label}
            {question.required && (
              <span className="ml-0.5 text-danger" aria-hidden>
                *
              </span>
            )}
          </legend>
          {question.hint && (
            <p className="mt-0.5 text-[13px] text-ink-subtle">{question.hint}</p>
          )}
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {question.options?.map((option) => (
              <Checkbox
                key={option.value}
                label={option.label}
                checked={seleccionadas.includes(option.value)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...seleccionadas, option.value]
                      : seleccionadas.filter((v) => v !== option.value),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
      ) : question.type === "boolean" ? (
        <Checkbox
          label={question.label}
          description={question.hint}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
      ) : (
        <Field
          label={question.label}
          hint={question.hint}
          required={question.required}
        >
          {(props) =>
            question.type === "select" ? (
              <Select
                {...props}
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onChange(event.target.value)}
              >
                <option value="">Selecciona una opción…</option>
                {question.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            ) : question.type === "number" ? (
              <div className="relative">
                <Input
                  {...props}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={typeof value === "number" ? value : ""}
                  onChange={(event) =>
                    onChange(
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                    )
                  }
                  className={cn("numeric", question.unit && "pr-24")}
                />
                {question.unit && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-subtle"
                  >
                    {question.unit}
                  </span>
                )}
              </div>
            ) : (
              <Textarea
                {...props}
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onChange(event.target.value)}
                rows={2}
              />
            )
          }
        </Field>
      )}

      {/* Solo para el equipo: qué decisión técnica depende de esta respuesta. */}
      {showRationale && (
        <p className="mt-2 flex gap-2 rounded-md border border-accent/15 bg-accent-soft px-2.5 py-2 text-[12px] leading-relaxed text-accent">
          <ClipboardList className="mt-px size-3.5 shrink-0" aria-hidden />
          {question.decision}
        </p>
      )}
    </div>
  );
}
