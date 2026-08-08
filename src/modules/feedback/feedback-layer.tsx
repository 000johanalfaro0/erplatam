"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  MessageSquarePlus,
  MousePointerClick,
  Trash2,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ApiError, api, type Paginated } from "@/lib/api";
import {
  type ElementAnchor,
  crearAncla,
  deserializarAncla,
  resolverAncla,
  serializarAncla,
} from "@/lib/anchor";
import { cn } from "@/lib/utils";

import { PostIt, papelDe } from "./post-it";

/**
 * CAPA DE ANOTACIONES (requisito 21, rediseñado)
 * ===========================================================================
 * Una capa que vive ENCIMA del software, como pósits pegados a la pantalla.
 *
 * Lo que cambió respecto a la primera versión: aquella era un formulario que
 * se abría y se cerraba, y las anotaciones desaparecían en una bandeja. Esta
 * las mantiene visibles sobre la interfaz, ancladas a lo que comentan.
 *
 * COMPORTAMIENTO ACORDADO:
 *   - Notas con el texto SIEMPRE VISIBLE, no pins que haya que abrir.
 *   - Visibles SOLO con el modo activo: el sistema se ve limpio el resto del
 *     tiempo, y el cliente puede enseñarlo a otras personas sin ruido.
 *   - PEGADAS AL ELEMENTO: la nota sigue al botón o campo aunque la tabla
 *     tenga otras filas o cambie el tamaño de ventana.
 *   - Sin hilos de conversación: se anota y se marca el estado.
 *
 * EL PROBLEMA DIFÍCIL es el anclaje, y vive en `lib/anchor.ts`. Aquí solo se
 * resuelve la posición y se dibuja.
 */

interface Anotacion {
  id: string;
  title: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: string;
  route: string;
  elementLabel: string | null;
  elementPath: string | null;
  createdBy: { id: string; name: string } | null;
}

interface NotaUbicada {
  anotacion: Anotacion;
  ancla: ElementAnchor;
  /** Posición del elemento anclado, en coordenadas de página. */
  rect: { top: number; left: number; width: number; height: number } | null;
}

const ANCHO_NOTA = 224;
/** Alto mínimo del papel. Un post-it es casi cuadrado, no una tira. */
const ALTO_NOTA = 128;
/** Alto aproximado del papel mientras se escribe, con sus botones. */
const ALTO_BORRADOR = 210;
const SEPARACION = 12;

export function FeedbackLayer() {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const [activo, setActivo] = React.useState(false);
  const [borrador, setBorrador] = React.useState<{
    ancla: ElementAnchor;
    texto: string;
    /** Coordenadas de viewport del clic que la originó. */
    left: number;
    top: number;
  } | null>(null);
  const [ubicadas, setUbicadas] = React.useState<NotaUbicada[]>([]);

  // --- Anotaciones de ESTA pantalla ---
  const { data } = useQuery({
    queryKey: ["feedback-layer", pathname],
    queryFn: () =>
      api.get<Paginated<Anotacion>>("/feedback", {
        route: pathname,
        pageSize: 50,
      }),
    enabled: activo,
    // Se refresca al volver a la pestaña: si otra persona anotó algo mientras
    // tanto, debe aparecer.
    staleTime: 10_000,
  });

  /**
   * Recalcula dónde va cada nota.
   *
   * Se ejecuta al cargar, al hacer scroll, al cambiar el tamaño de la ventana
   * y cuando el contenido cambia. Sin esto, las notas se quedarían flotando
   * en el sitio donde estaban cuando se abrió la pantalla.
   */
  const recolocar = React.useCallback(() => {
    if (!activo || !data) {
      setUbicadas([]);
      return;
    }

    const resultado: NotaUbicada[] = [];

    for (const anotacion of data.items) {
      const ancla = deserializarAncla(anotacion.elementPath);
      if (!ancla) {
        resultado.push({ anotacion, ancla: { label: "Sin ubicación" }, rect: null });
        continue;
      }

      const el = resolverAncla(ancla);

      /*
       * Coordenadas de VIEWPORT, no de página, y posicionamiento `fixed`.
       *
       * En este layout quien hace scroll no es la ventana sino el contenedor
       * <main>. Con `position: absolute` y coordenadas de página las notas se
       * quedarían flotando en el sitio equivocado en cuanto se desplazara el
       * contenido.
       *
       * `getBoundingClientRect` ya da coordenadas de viewport, así que basta
       * con recalcular en cada scroll — que es lo que hace el listener con
       * `capture: true`, para capturar el scroll de cualquier contenedor.
       */
      const b = el?.getBoundingClientRect();

      resultado.push({
        anotacion,
        ancla,
        rect:
          b && b.width > 0
            ? { top: b.top, left: b.left, width: b.width, height: b.height }
            : null,
      });
    }

    setUbicadas(resultado);
  }, [activo, data]);

  React.useEffect(() => {
    if (!activo) return;

    // Se mide DESPUÉS del pintado, no dentro del efecto. Medir antes de que
    // el navegador haya pintado devuelve rectángulos de cero y las notas
    // aparecen todas apiladas en la esquina durante un fotograma.
    const marco = requestAnimationFrame(recolocar);

    // Un poco después: el contenido puede tardar en pintarse.
    const timer = setTimeout(recolocar, 400);

    window.addEventListener("scroll", recolocar, true);
    window.addEventListener("resize", recolocar);

    // Reacciona a cambios de contenido: filtrar una tabla mueve los elementos.
    const observer = new MutationObserver(() => recolocar());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(marco);
      clearTimeout(timer);
      window.removeEventListener("scroll", recolocar, true);
      window.removeEventListener("resize", recolocar);
      observer.disconnect();
    };
  }, [activo, recolocar]);

  // --- Crear anotación: clic sobre cualquier elemento ---
  React.useEffect(() => {
    if (!activo || borrador) return;

    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("[data-feedback-ui]")) return;

      // Se intercepta el clic para que no active el botón señalado.
      event.preventDefault();
      event.stopPropagation();

      /*
       * La nota se abre DONDE SE HIZO CLIC, no centrada en la pantalla.
       *
       * Centrada obligaba a mirar a otro sitio para escribir y volver para
       * comprobar qué se había señalado. Con el papel junto al dedo, señalar
       * y escribir son el mismo gesto, que es lo que hace que alguien deje
       * cinco notas en lugar de una.
       *
       * Se acota al viewport para que un clic cerca del borde derecho o de
       * abajo no deje el papel medio fuera.
       */
      const margen = 12;
      const left = Math.min(
        Math.max(margen, event.clientX + 14),
        window.innerWidth - ANCHO_NOTA - margen,
      );
      const top = Math.min(
        Math.max(margen, event.clientY - 16),
        window.innerHeight - ALTO_BORRADOR - margen,
      );

      setBorrador({ ancla: crearAncla(target), texto: "", left, top });
    }

    // `capture: true` para llegar antes que los manejadores de la aplicación.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [activo, borrador]);

  const guardar = useMutation({
    mutationFn: () => {
      if (!borrador) throw new Error("sin borrador");
      return api.post("/feedback", {
        kind: "COMMENT",
        priority: "MEDIUM",
        title: borrador.texto.trim(),
        route: pathname,
        elementLabel: borrador.ancla.label,
        elementPath: serializarAncla(borrador.ancla),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback-layer"] });
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      setBorrador(null);
      toast.success("Nota pegada");
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : "No pudimos guardar la nota.",
      );
    },
  });

  const descartar = useMutation({
    mutationFn: (id: string) => api.patch(`/feedback/${id}`, { status: "DISCARDED" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback-layer"] });
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      toast.success("Nota quitada");
    },
    onError: () => toast.error("No pudimos quitar la nota."),
  });

  /**
   * Coloca la nota junto a su elemento, evitando que se salgan por la derecha
   * y que se solapen entre sí.
   *
   * El apilado importa: dos anotaciones sobre elementos cercanos quedarían una
   * encima de otra y solo se leería la última.
   */
  const posiciones = React.useMemo(() => {
    const usadas: { top: number; bottom: number; left: number }[] = [];

    return ubicadas.map((nota) => {
      if (!nota.rect) return null;

      const cabeDerecha =
        nota.rect.left + nota.rect.width + ANCHO_NOTA + SEPARACION <
        window.innerWidth;

      const left = cabeDerecha
        ? nota.rect.left + nota.rect.width + SEPARACION
        : Math.max(8, nota.rect.left - ANCHO_NOTA - SEPARACION);

      let top = nota.rect.top;

      // Desplaza hacia abajo mientras choque con otra nota ya colocada.
      let intentos = 0;
      while (
        intentos < 12 &&
        usadas.some(
          (u) =>
            Math.abs(u.left - left) < ANCHO_NOTA &&
            top < u.bottom + 6 &&
            top + ALTO_NOTA > u.top,
        )
      ) {
        top += ALTO_NOTA + 8;
        intentos++;
      }

      usadas.push({ top, bottom: top + ALTO_NOTA, left });
      return { top, left };
    });
  }, [ubicadas]);

  const huerfanas = ubicadas.filter((n) => !n.rect);

  return (
    <>
      {/* --- Notas ancladas --- */}
      {activo &&
        ubicadas.map((nota, i) => {
          const pos = posiciones[i];
          if (!pos || !nota.rect) return null;

          return (
            <React.Fragment key={nota.anotacion.id}>
              {/* Recuadro sobre el elemento comentado */}
              <div
                data-feedback-ui
                aria-hidden
                className="pointer-events-none fixed z-90 rounded-sm ring-2 ring-warning/60"
                style={{
                  top: nota.rect.top - 3,
                  left: nota.rect.left - 3,
                  width: nota.rect.width + 6,
                  height: nota.rect.height + 6,
                }}
              />

              {/* La nota */}
              <PostIt
                data-feedback-ui
                semilla={nota.anotacion.id}
                className="fixed z-90 flex w-56 flex-col px-3.5 pb-2 pt-4"
                style={{
                  top: pos.top,
                  left: pos.left,
                  minHeight: ALTO_NOTA,
                }}
              >
                <p className="flex-1 font-manuscrita text-[19px] leading-[1.25] break-words">
                  {nota.anotacion.title}
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-[13px] text-[#2b2a24]/55">
                  <span className="truncate font-manuscrita">
                    {nota.anotacion.createdBy?.name ?? "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => descartar.mutate(nota.anotacion.id)}
                    aria-label={`Quitar la nota "${nota.anotacion.title}"`}
                    className="ml-auto shrink-0 p-0.5 transition-colors hover:text-danger"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </PostIt>
            </React.Fragment>
          );
        })}

      {/* --- Nota en edición --- */}
      {activo && borrador && (
        <PostIt
          data-feedback-ui
          // Semilla fija: mientras se escribe, el papel no debe cambiar de
          // color ni de inclinación con cada tecla.
          semilla="borrador"
          className="fixed z-100 px-4 pb-3 pt-4"
          style={{
            left: borrador.left,
            top: borrador.top,
            width: ANCHO_NOTA,
          }}
        >
          <p className="mb-2 text-[12px] font-medium text-[#2b2a24]/60">
            {borrador.ancla.label}
          </p>
          <textarea
            autoFocus
            value={borrador.texto}
            onChange={(e) => setBorrador({ ...borrador, texto: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Escape") setBorrador(null);
              // Enter guarda; Shift+Enter hace salto de línea. Anotar debe
              // costar un gesto, no tres.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (borrador.texto.trim().length >= 3) guardar.mutate();
              }
            }}
            placeholder="¿Qué cambiarías de esto?"
            aria-label="Texto de la nota"
            rows={3}
            // Se escribe directamente sobre el papel: sin caja, sin borde y
            // con la misma letra que tendrá la nota una vez pegada. Escribir
            // dentro de un campo de formulario encima de un post-it rompería
            // la ilusión justo en el momento en que más importa.
            className="w-full resize-none border-0 bg-transparent font-manuscrita text-[19px] leading-[1.25] text-[#2b2a24] outline-none placeholder:text-[#2b2a24]/35"
          />
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[11px] text-[#2b2a24]/50">Enter para pegar</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setBorrador(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={guardar.isPending}
              disabled={borrador.texto.trim().length < 3}
              onClick={() => guardar.mutate()}
            >
              <Check />
              Pegar
            </Button>
          </div>
        </PostIt>
      )}

      {/* --- Barra de control --- */}
      <div
        data-feedback-ui
        className="fixed bottom-4 left-1/2 z-100 -translate-x-1/2"
      >
        {!activo ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setActivo(true)}
            className="shadow-overlay"
            // Ancla del tutorial: el primer paso señala este botón.
            data-tour="feedback-boton"
          >
            <MessageSquarePlus />
            Modo feedback
          </Button>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-surface-raised px-2 py-1.5 shadow-overlay">
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-warning">
              <span className="size-1.5 animate-pulse rounded-full bg-warning" />
              {ubicadas.length > 0
                ? `${ubicadas.length} ${ubicadas.length === 1 ? "nota" : "notas"} aquí`
                : "Sin notas aquí"}
            </span>

            <span className="hidden items-center gap-1 text-[12px] text-ink-subtle sm:flex">
              <MousePointerClick className="size-3" aria-hidden />
              haz clic en lo que quieras comentar
            </span>

            {huerfanas.length > 0 && (
              <span
                className="text-[11px] text-ink-subtle"
                title="Estas notas señalaban algo que ya no está en la pantalla"
              >
                · {huerfanas.length} sin ubicar
              </span>
            )}

            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Salir del modo feedback"
              onClick={() => {
                setActivo(false);
                setBorrador(null);
              }}
            >
              <X />
            </Button>
          </div>
        )}
      </div>

      {/* --- Notas huérfanas: su elemento ya no existe --- */}
      {activo && huerfanas.length > 0 && (
        <div
          data-feedback-ui
          className="fixed bottom-16 right-4 z-90 w-60 rounded-md border border-line bg-surface-raised p-2.5 shadow-overlay"
        >
          <p className="mb-1.5 text-[11px] font-medium text-ink-muted">
            Notas sin ubicar
          </p>
          <p className="mb-2 text-[11px] leading-snug text-ink-subtle">
            Señalaban algo que ya no está en esta pantalla.
          </p>
          <ul className="space-y-1.5">
            {huerfanas.map((n) => (
              <li
                key={n.anotacion.id}
                className="rounded-sm bg-surface-sunken px-2 py-1.5 text-[12px] text-ink"
              >
                {n.anotacion.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        Atenúa ligeramente la interfaz mientras el modo está activo, para que
        se note que estás anotando y no operando. No bloquea: el clic tiene que
        llegar a los elementos para poder señalarlos.
      */}
      {activo && (
        <div
          data-feedback-ui
          aria-hidden
          className={cn(
            "pointer-events-none fixed inset-0 z-80",
            "ring-2 ring-inset ring-warning/30",
          )}
        />
      )}
    </>
  );
}
