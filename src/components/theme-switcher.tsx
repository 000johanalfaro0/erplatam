"use client";

import { Check, Palette } from "lucide-react";
import * as React from "react";

import {
  DEFAULT_THEME_ID,
  THEMES,
  THEME_STORAGE_KEY,
  type Theme,
  getTheme,
} from "@/config/themes";
import { cn } from "@/lib/utils";

import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/overlay";

/**
 * CONMUTADOR DE DIRECCIÓN VISUAL
 * ===========================================================================
 * Herramienta de la demo: el cliente ve las tres direcciones en su propio
 * sistema, con sus propios datos, y elige. No sobre una lámina: sobre la
 * pantalla que va a usar todos los días.
 *
 * Es temporal. Cuando el cliente decida, se consolida la elegida en
 * `globals.css` y este componente se retira junto con las otras dos.
 *
 * CÓMO FUNCIONA: se inyectan las variables CSS de la dirección elegida en el
 * elemento raíz. Ningún componente sabe qué dirección está activa —todos leen
 * las mismas variables— así que cambiar de una a otra no puede romper nada.
 * Esa es exactamente la ventaja de haber centralizado los colores desde el
 * principio.
 */

/**
 * Aplica una dirección: un atributo, y ya.
 *
 * Antes esto inyectaba cada variable como estilo EN LÍNEA sobre <html>, y
 * eso rompió el modo oscuro entero: un estilo en línea gana a cualquier hoja
 * de estilos, así que los colores claros de la dirección pisaban al tema
 * oscuro y el botón de la luna no cambiaba nada. Con las direcciones escritas
 * en `globals.css`, la cascada resuelve sola quién manda.
 */
function aplicar(theme: Theme) {
  document.documentElement.dataset.direccion = theme.id;
}

export function ThemeSwitcher() {
  const [actual, setActual] = React.useState<string>(DEFAULT_THEME_ID);

  // Se aplica al montar, antes de que el usuario toque nada.
  React.useEffect(() => {
    let guardado: string | null = null;
    try {
      guardado = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // Almacenamiento bloqueado: se usa la dirección por defecto.
    }

    const theme = getTheme(guardado);
    aplicar(theme);
    setActual(theme.id);
  }, []);

  function elegir(theme: Theme) {
    aplicar(theme);
    setActual(theme.id);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme.id);
    } catch {
      // Sin persistencia, pero el cambio visual sí ocurre.
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Cambiar la apariencia"
          title="Probar otra apariencia"
        >
          <Palette />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>
          <span className="block text-[13px] font-medium text-ink">
            ¿Cuál te gusta más?
          </span>
          <span className="mt-0.5 block font-normal leading-snug text-ink-subtle">
            Pruébalas con tus propios datos. Nos quedamos con la que elijas.
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <div className="space-y-1 p-1">
          {THEMES.map((theme) => {
            const activa = theme.id === actual;

            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => elegir(theme)}
                aria-pressed={activa}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-sm p-2.5 text-left transition-colors",
                  activa ? "bg-accent-soft" : "hover:bg-surface-sunken",
                )}
              >
                {/* Muestra del acento y el icono de cada dirección */}
                <span
                  aria-hidden
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-white [&_svg]:size-4"
                  style={{ backgroundColor: theme.muestra }}
                  dangerouslySetInnerHTML={{ __html: theme.icono }}
                />

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "text-[13px] font-medium",
                        activa ? "text-accent" : "text-ink",
                      )}
                    >
                      {theme.nombre}
                    </span>
                    {activa && (
                      <Check className="size-3.5 text-accent" aria-hidden />
                    )}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-ink-muted">
                    {theme.apuesta}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <DropdownMenuSeparator />

        <p className="px-2.5 py-1.5 text-[11px] leading-snug text-ink-subtle">
          Cambia el color, la tipografía, las esquinas, la densidad y hasta el
          nombre. No cambia nada de cómo funciona.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Nombre e icono de la dirección activa, para la barra lateral. */
export function useBrand() {
  const [theme, setTheme] = React.useState<Theme>(getTheme(DEFAULT_THEME_ID));

  React.useEffect(() => {
    function leer() {
      try {
        setTheme(getTheme(localStorage.getItem(THEME_STORAGE_KEY)));
      } catch {
        // Se conserva la dirección por defecto.
      }
    }

    leer();

    // El conmutador cambia el atributo del elemento raíz; observarlo evita
    // tener que montar un contexto solo para esto.
    const observer = new MutationObserver(leer);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-direccion"],
    });

    return () => observer.disconnect();
  }, []);

  return theme;
}
