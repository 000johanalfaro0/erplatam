"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toPng } from "html-to-image";
import {
  Camera,
  MessageSquarePlus,
  MousePointerClick,
  SquareDashedMousePointer,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/field";
import { Modal, ModalContent } from "@/components/ui/overlay";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * MODO FEEDBACK (requisito 21)
 * ===========================================================================
 * Cuando está activo, el cliente puede:
 *
 *   - Hacer CLIC DERECHO sobre cualquier elemento para comentarlo. El sistema
 *     identifica solo qué elemento es y cómo se llama.
 *   - Activar "Dibujar zona" y ARRASTRAR un rectángulo para proponer algo que
 *     no existe: "aquí quiero un botón de imprimir ticket".
 *   - Adjuntar automáticamente una captura de la pantalla.
 *
 * El sistema NO crea el botón. Guarda la propuesta anclada a esa pantalla y a
 * esas coordenadas, con la resolución de la ventana. Es un cuaderno de notas
 * sobre la aplicación.
 *
 * Por qué anclar en lugar de pedir un correo: "el botón de arriba no se ve
 * bien" es irresoluble. Un rectángulo sobre una pantalla concreta a un ancho
 * concreto, no.
 */

interface Anchor {
  label: string | null;
  path: string | null;
  rect: { x: number; y: number; width: number; height: number } | null;
}

/**
 * Describe el elemento sobre el que se hizo clic, en lenguaje humano.
 *
 * Prioriza el nombre accesible (aria-label, texto visible) sobre el selector
 * CSS: para el desarrollador que lea el feedback, "Botón Cobrar" es
 * infinitamente más útil que "div > div:nth-child(3) > button".
 */
function describeElement(element: HTMLElement): { label: string; path: string } {
  const interactivo = element.closest(
    "button, a, input, select, textarea, [role='button'], th, td, h1, h2, h3",
  ) as HTMLElement | null;

  const target = interactivo ?? element;

  const label =
    target.getAttribute("aria-label") ??
    target.getAttribute("placeholder") ??
    target.textContent?.trim().slice(0, 80) ??
    target.tagName.toLowerCase();

  // Ruta corta y legible: etiqueta + identificador de tour si lo tiene.
  const partes: string[] = [];
  let actual: HTMLElement | null = target;
  let profundidad = 0;

  while (actual && profundidad < 4) {
    const tour = actual.dataset.tour;
    const id = actual.id;
    partes.unshift(
      tour ? `[data-tour=${tour}]` : id ? `#${id}` : actual.tagName.toLowerCase(),
    );
    actual = actual.parentElement;
    profundidad++;
  }

  const tipo = target.tagName.toLowerCase();
  const nombreTipo =
    tipo === "button" ? "Botón" : tipo === "a" ? "Enlace" : tipo === "input" ? "Campo" : "Elemento";

  return {
    label: `${nombreTipo} "${label}"`.slice(0, 200),
    path: partes.join(" > ").slice(0, 1000),
  };
}

const KIND_OPTIONS = [
  { value: "COMMENT", label: "Comentario — algo que mejorar" },
  { value: "NEW_ELEMENT", label: "Propuesta — quiero algo que no está" },
  { value: "BUG", label: "Error — algo no funciona" },
  { value: "IDEA", label: "Idea — para más adelante" },
] as const;

const ELEMENT_OPTIONS = [
  { value: "BUTTON", label: "Un botón" },
  { value: "FIELD", label: "Un campo" },
  { value: "TABLE", label: "Una tabla o listado" },
  { value: "FILTER", label: "Un filtro" },
  { value: "REPORT", label: "Un reporte" },
  { value: "OTHER", label: "Otra cosa" },
] as const;

export function FeedbackMode() {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const [active, setActive] = React.useState(false);
  const [drawing, setDrawing] = React.useState(false);
  const [drawStart, setDrawStart] = React.useState<{ x: number; y: number } | null>(
    null,
  );
  const [drawRect, setDrawRect] = React.useState<Anchor["rect"]>(null);

  const [anchor, setAnchor] = React.useState<Anchor | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  /**
   * Captura tomada en el INSTANTE del clic derecho, antes de abrir el
   * formulario. Ver `captureNow()` para el motivo.
   */
  const [pendingShot, setPendingShot] = React.useState<string | null>(null);

  // --- Campos del formulario ---
  const [kind, setKind] = React.useState<string>("COMMENT");
  const [priority, setPriority] = React.useState("MEDIUM");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [proposedElement, setProposedElement] = React.useState("BUTTON");
  const [withScreenshot, setWithScreenshot] = React.useState(true);
  const [capturing, setCapturing] = React.useState(false);

  function reset() {
    setKind("COMMENT");
    setPriority("MEDIUM");
    setTitle("");
    setDescription("");
    setProposedElement("BUTTON");
    setWithScreenshot(true);
    setAnchor(null);
    setPendingShot(null);
    setDrawRect(null);
    setDrawing(false);
    setDrawStart(null);
  }

  // --- Clic derecho sobre la interfaz --------------------------------------
  React.useEffect(() => {
    if (!active || drawing) return;

    async function onContextMenu(event: MouseEvent) {
      const target = event.target as HTMLElement;

      // No se secuestra el clic derecho dentro del propio panel de feedback:
      // ahí el usuario querrá pegar texto con el menú del navegador.
      if (target.closest("[data-feedback-ui]")) return;

      event.preventDefault();

      const { label, path } = describeElement(target);
      const bounds = (target.closest("button, a, input, td, th, div") ?? target)
        .getBoundingClientRect();

      setAnchor({
        label,
        path,
        rect: {
          x: Math.round(bounds.left + window.scrollX),
          y: Math.round(bounds.top + window.scrollY),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
        },
      });
      setKind("COMMENT");

      // La captura se toma AHORA, con la pantalla limpia. El formulario se
      // abre después.
      setCapturing(true);
      const shot = await captureNow();
      setPendingShot(shot);
      setCapturing(false);

      setFormOpen(true);
    }

    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, [active, drawing]);

  // --- Dibujo de rectángulo -------------------------------------------------
  React.useEffect(() => {
    if (!drawing) return;

    function onDown(event: MouseEvent) {
      if ((event.target as HTMLElement).closest("[data-feedback-ui]")) return;
      event.preventDefault();
      setDrawStart({ x: event.clientX, y: event.clientY });
      setDrawRect(null);
    }

    function onMove(event: MouseEvent) {
      if (!drawStart) return;
      setDrawRect({
        x: Math.min(drawStart.x, event.clientX),
        y: Math.min(drawStart.y, event.clientY),
        width: Math.abs(event.clientX - drawStart.x),
        height: Math.abs(event.clientY - drawStart.y),
      });
    }

    async function onUp() {
      if (!drawStart || !drawRect) {
        setDrawStart(null);
        return;
      }

      // Un rectángulo minúsculo es un clic accidental, no una intención.
      if (drawRect.width < 12 || drawRect.height < 12) {
        setDrawStart(null);
        setDrawRect(null);
        return;
      }

      setAnchor({
        label: null,
        path: null,
        rect: {
          x: Math.round(drawRect.x + window.scrollX),
          y: Math.round(drawRect.y + window.scrollY),
          width: Math.round(drawRect.width),
          height: Math.round(drawRect.height),
        },
      });
      setKind("NEW_ELEMENT");
      setDrawStart(null);
      setDrawing(false);

      setCapturing(true);
      const shot = await captureNow();
      setPendingShot(shot);
      setCapturing(false);

      setFormOpen(true);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [drawing, drawStart, drawRect]);

  /**
   * Toma la captura AHORA, antes de que se abra el formulario.
   *
   * POR QUÉ AQUÍ Y NO AL GUARDAR
   * -------------------------------------------------------------------------
   * La primera versión capturaba al pulsar "Guardar", y la imagen salía con el
   * propio formulario de anotación encima, tapando justo lo que el cliente
   * quería mostrar.
   *
   * El intento de arreglarlo filtrando por `data-feedback-ui` no funciona:
   * Radix renderiza los diálogos en un portal, así que en el DOM real el
   * diálogo NO es descendiente del elemento marcado — el filtro nunca lo ve.
   *
   * Capturar en el momento del clic derecho es además lo semánticamente
   * correcto: la imagen debe mostrar la pantalla tal como la vio el cliente
   * cuando decidió comentarla, no cómo quedó después de abrir un formulario.
   */
  async function captureNow(): Promise<string | null> {
    try {
      return await toPng(document.body, {
        // Se excluyen la barra de control y las notificaciones flotantes, que
        // sí son descendientes normales del body.
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          if (node.dataset.feedbackUi !== undefined) return false;
          if (node.hasAttribute("data-sonner-toaster")) return false;
          return true;
        },
        // Escala 1 y calidad moderada: una captura de 3 MB no aporta más
        // información que una de 300 KB, y sí satura la base de datos.
        pixelRatio: 1,
        quality: 0.85,
        cacheBust: true,
      });
    } catch {
      // Si la captura falla, la anotación sigue siendo válida sin ella.
      return null;
    }
  }

  const submit = useMutation({
    mutationFn: async () => {
      // Se usa la captura tomada en el momento del clic, no una nueva: una
      // nueva saldría con el formulario encima.
      const screenshot = withScreenshot ? pendingShot : null;

      return api.post("/feedback", {
        kind,
        priority,
        title,
        description: description || null,
        route: pathname,
        elementLabel: anchor?.label ?? null,
        elementPath: anchor?.path ?? null,
        anchorRect: anchor?.rect ?? null,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        proposedElement: kind === "NEW_ELEMENT" ? proposedElement : null,
        screenshot,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      toast.success("Anotación guardada", {
        description: "Queda registrada con la pantalla y el punto exacto.",
      });
      setFormOpen(false);
      reset();
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "No pudimos guardar la anotación.",
      );
    },
  });

  return (
    <>
      {/* --- Resaltado del elemento anclado --- */}
      {active && anchor?.rect && !formOpen && (
        <div
          data-feedback-ui
          aria-hidden
          className="pointer-events-none fixed z-90 rounded-sm border-2 border-accent bg-accent/10"
          style={{
            left: anchor.rect.x - window.scrollX,
            top: anchor.rect.y - window.scrollY,
            width: anchor.rect.width,
            height: anchor.rect.height,
          }}
        />
      )}

      {/* --- Rectángulo mientras se dibuja --- */}
      {drawing && (
        <>
          <div
            data-feedback-ui
            className="fixed inset-0 z-90 cursor-crosshair bg-accent/5"
          />
          {drawRect && (
            <div
              data-feedback-ui
              aria-hidden
              className="pointer-events-none fixed z-90 rounded-sm border-2 border-dashed border-accent bg-accent/15"
              style={{
                left: drawRect.x,
                top: drawRect.y,
                width: drawRect.width,
                height: drawRect.height,
              }}
            />
          )}
        </>
      )}

      {/* --- Barra de control --- */}
      <div
        data-feedback-ui
        className="fixed bottom-4 left-1/2 z-100 -translate-x-1/2"
      >
        {!active ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setActive(true)}
            className="shadow-overlay"
          >
            <MessageSquarePlus />
            Modo feedback
          </Button>
        ) : (
          <div className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-surface-raised p-1.5 shadow-overlay">
            <span className="flex items-center gap-1.5 px-2 text-[12px] font-medium text-accent">
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              Modo feedback
            </span>

            <span className="hidden text-[12px] text-ink-subtle sm:inline">
              <MousePointerClick className="mr-1 inline size-3" aria-hidden />
              clic derecho para comentar
            </span>

            <Button
              variant={drawing ? "primary" : "ghost"}
              size="sm"
              onClick={() => {
                setDrawing((value) => !value);
                setDrawRect(null);
              }}
              aria-pressed={drawing}
            >
              <SquareDashedMousePointer />
              {drawing ? "Dibujando…" : "Dibujar zona"}
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Salir del modo feedback"
              onClick={() => {
                setActive(false);
                reset();
              }}
            >
              <X />
            </Button>
          </div>
        )}
      </div>

      {/* --- Formulario --- */}
      <Modal
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) reset();
        }}
      >
        <div data-feedback-ui>
          <ModalContent
            title="Dejar una anotación"
            description={
              anchor?.label
                ? `Sobre: ${anchor.label}`
                : anchor?.rect
                  ? "Sobre la zona que dibujaste"
                  : `En la pantalla ${pathname}`
            }
            footer={
              <>
                <Button
                  variant="secondary"
                  onClick={() => setFormOpen(false)}
                  disabled={submit.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  loading={submit.isPending || capturing}
                  disabled={title.trim().length < 3}
                  onClick={() => submit.mutate()}
                >
                  {capturing ? "Capturando…" : "Guardar anotación"}
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <Field label="¿De qué se trata?" required>
                {(props) => (
                  <Select
                    {...props}
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                  >
                    {KIND_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              {kind === "NEW_ELEMENT" && (
                <Field
                  label="¿Qué quieres que haya aquí?"
                  hint="Esto NO crea el elemento. Es una propuesta para el equipo."
                >
                  {(props) => (
                    <Select
                      {...props}
                      value={proposedElement}
                      onChange={(event) => setProposedElement(event.target.value)}
                    >
                      {ELEMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}

              <Field label="En pocas palabras" required>
                {(props) => (
                  <Textarea
                    {...props}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Quiero un botón aquí para imprimir el ticket"
                    rows={2}
                    autoFocus
                  />
                )}
              </Field>

              <Field label="Explícalo mejor" hint="Opcional">
                {(props) => (
                  <Textarea
                    {...props}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Cuando cobro, la clienta casi siempre pide el ticket impreso…"
                    rows={3}
                  />
                )}
              </Field>

              <Field label="¿Qué tan urgente es?">
                {(props) => (
                  <Select
                    {...props}
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                  >
                    <option value="HIGH">Alta — me bloquea el trabajo</option>
                    <option value="MEDIUM">Media — me estorba pero puedo</option>
                    <option value="LOW">Baja — estaría bien tenerlo</option>
                  </Select>
                )}
              </Field>

              <Checkbox
                label="Adjuntar captura de pantalla"
                description={
                  pendingShot
                    ? "Ya se capturó la pantalla, sin este formulario encima."
                    : "No se pudo capturar la pantalla en este navegador."
                }
                checked={withScreenshot && pendingShot !== null}
                disabled={pendingShot === null}
                onChange={(event) => setWithScreenshot(event.target.checked)}
              />

              {/* Vista previa de lo que se va a enviar. Que el cliente vea la
                  captura antes de guardar evita el "no era eso lo que quería
                  mostrar". */}
              {withScreenshot && pendingShot && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={pendingShot}
                  alt="Vista previa de la captura que se adjuntará"
                  className="w-full rounded-md border border-line"
                />
              )}

              <p className="flex gap-2 rounded-md border border-line bg-surface-sunken px-3 py-2.5 text-[12px] leading-relaxed text-ink-muted">
                <Camera className="mt-px size-3.5 shrink-0" aria-hidden />
                Se guardará también la pantalla ({pathname}) y el tamaño de tu
                ventana ({typeof window !== "undefined" ? window.innerWidth : 0}
                px), para que el equipo pueda reproducir lo que ves.
              </p>
            </div>
          </ModalContent>
        </div>
      </Modal>
    </>
  );
}
