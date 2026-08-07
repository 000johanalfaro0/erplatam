"use client";

import { ArrowLeft, ArrowRight, GraduationCap, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { TOUR_STEPS, TOUR_STORAGE_KEY } from "@/config/tour";
import { cn } from "@/lib/utils";

/**
 * TUTORIAL GUIADO (requisito 20)
 * ===========================================================================
 * Oscurece toda la interfaz y deja iluminado solo el elemento del que se
 * habla, como el tutorial de un videojuego.
 *
 * CÓMO SE HACE EL RECORTE, y por qué así:
 * la capa oscura es un único div con `box-shadow` de radio enorme y expansión
 * gigante. El "agujero" es el propio div, colocado sobre el elemento; la
 * sombra tiñe todo lo que queda fuera.
 *
 * Alternativas descartadas:
 *   - Cuatro divs rodeando el elemento: se ven costuras al animar y hay que
 *     recalcular cuatro rectángulos.
 *   - Un SVG con máscara: funciona, pero complica el redimensionado y no
 *     admite bordes redondeados con la misma facilidad.
 *   - `backdrop-filter` con clip-path: irregular entre navegadores.
 *
 * ACCESIBILIDAD Y AUTOMATIZACIÓN: el elemento iluminado sigue siendo
 * interactivo (la capa tiene `pointer-events: none`), así que el usuario puede
 * hacer clic en lo que se le indica sin salir del tutorial. Eso lo hace además
 * automatizable: una prueba puede recorrer el tutorial pulsando lo mismo que
 * pulsaría una persona.
 */

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 6;

export function GuidedTour() {
  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const step = TOUR_STEPS[index];
  const isLast = index === TOUR_STEPS.length - 1;

  // --- Posicionamiento del foco --------------------------------------------
  const locate = React.useCallback(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }

    const element = document.querySelector(step.target);
    if (!element) {
      setRect(null);
      return;
    }

    const bounds = element.getBoundingClientRect();
    setRect({
      top: bounds.top - PADDING,
      left: bounds.left - PADDING,
      width: bounds.width + PADDING * 2,
      height: bounds.height + PADDING * 2,
    });
  }, [step]);

  React.useEffect(() => {
    if (!open) return;

    // Si el paso vive en otra pantalla, se navega primero.
    if (step?.route && step.route !== pathname) {
      router.push(step.route);
    }

    // Se reintenta un momento después: tras navegar, el elemento puede tardar
    // en existir. Sin esto, el foco se quedaría en el sitio anterior.
    locate();
    const timer = setTimeout(locate, 350);

    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate, true);
    };
  }, [open, step, pathname, router, locate]);

  // --- Teclado --------------------------------------------------------------
  React.useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        finish();
      } else if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, isLast]);

  function start() {
    setIndex(0);
    setOpen(true);
  }

  function next() {
    if (isLast) {
      finish();
    } else {
      setIndex((value) => value + 1);
    }
  }

  function finish() {
    setOpen(false);
    setIndex(0);
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, "1");
    } catch {
      // Si el almacenamiento está bloqueado, el tutorial simplemente volverá a
      // ofrecerse. No es motivo para romper nada.
    }
  }

  // --- Posición del panel de texto -----------------------------------------
  // Se coloca al lado del elemento iluminado, y centrado si no hay foco.
  const panelStyle: React.CSSProperties = React.useMemo(() => {
    if (!rect) {
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
    }

    const espacioDerecha = window.innerWidth - (rect.left + rect.width);

    // Si cabe a la derecha del elemento, ahí. Si no, debajo.
    if (espacioDerecha > 380) {
      return {
        top: Math.max(16, Math.min(rect.top, window.innerHeight - 280)),
        left: rect.left + rect.width + 16,
      };
    }

    return {
      top: Math.min(rect.top + rect.height + 16, window.innerHeight - 280),
      left: Math.max(16, Math.min(rect.left, window.innerWidth - 380)),
    };
  }, [rect]);

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={start}
        aria-label="Iniciar recorrido guiado"
        title="Recorrido guiado"
      >
        <GraduationCap />
      </Button>
    );
  }

  return (
    <>
      {/*
        Capa oscura con recorte.
        `pointer-events: none` es deliberado: el usuario debe poder pulsar el
        elemento iluminado sin salir del tutorial.
      */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-100"
        style={
          rect
            ? {
                // El agujero es este mismo div; la sombra tiñe todo lo demás.
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                borderRadius: 8,
                boxShadow: "0 0 0 9999px oklch(21% 0.006 240 / 0.72)",
                transition:
                  "top 250ms cubic-bezier(0.25,1,0.5,1), left 250ms cubic-bezier(0.25,1,0.5,1), width 250ms, height 250ms",
              }
            : { backgroundColor: "oklch(21% 0.006 240 / 0.72)" }
        }
      />

      {/* Anillo de acento sobre el elemento iluminado */}
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-100 rounded-lg ring-2 ring-accent"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            transition:
              "top 250ms cubic-bezier(0.25,1,0.5,1), left 250ms cubic-bezier(0.25,1,0.5,1), width 250ms, height 250ms",
          }}
        />
      )}

      {/* Panel de texto */}
      <div
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-titulo"
        className={cn(
          "fixed z-100 w-[min(22rem,calc(100vw-2rem))]",
          "rounded-lg border border-line bg-surface-raised p-4 shadow-overlay",
          "animate-in fade-in-0 zoom-in-[0.98] duration-200",
        )}
        style={panelStyle}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="numeric text-[11px] font-medium text-accent">
            Paso {index + 1} de {TOUR_STEPS.length}
          </span>
          <button
            type="button"
            onClick={finish}
            aria-label="Salir del recorrido"
            className="rounded-sm p-0.5 text-ink-subtle transition-colors hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <h2 id="tour-titulo" className="text-[15px] font-semibold text-ink">
          {step.title}
        </h2>

        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
          {step.body}
        </p>

        {step.action && (
          <p className="mt-3 rounded-md border border-accent/20 bg-accent-soft px-2.5 py-2 text-[12px] font-medium text-accent">
            {step.action}
          </p>
        )}

        {/* Progreso */}
        <div className="mt-4 flex items-center gap-3">
          <div
            className="flex flex-1 gap-1"
            role="progressbar"
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={TOUR_STEPS.length}
            aria-label="Progreso del recorrido"
          >
            {TOUR_STEPS.map((_, position) => (
              <span
                key={position}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  position <= index ? "bg-accent" : "bg-line",
                )}
              />
            ))}
          </div>

          <div className="flex shrink-0 gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              disabled={index === 0}
              aria-label="Paso anterior"
            >
              <ArrowLeft />
            </Button>
            <Button variant="primary" size="sm" onClick={next}>
              {isLast ? "Terminar" : "Siguiente"}
              {!isLast && <ArrowRight />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
