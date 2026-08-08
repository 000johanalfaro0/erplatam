"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { NAVIGATION } from "@/config/navigation";
import { cn } from "@/lib/utils";

import { useSession } from "../session-provider";
import { useBrand } from "../theme-switcher";

/**
 * NAVEGACIÓN SUPERIOR — dirección "Barra"
 *
 * No hay barra lateral. Los módulos son pestañas en una fila bajo la barra
 * de identidad, como en un programa de escritorio de toda la vida.
 *
 * POR QUÉ ES UNA APUESTA Y NO UN CAPRICHO: el contenido gana los 240 px que
 * ocupaba el menú. En una tabla de inventario con once columnas, esa es la
 * diferencia entre ver el impuesto y el estado o tener que desplazarse en
 * horizontal. A cambio, con muchos módulos las pestañas acaban apretadas;
 * por eso hay desplazamiento horizontal en pantallas pequeñas en lugar de un
 * menú "más", que escondería justo lo que se busca.
 *
 * Las secciones del menú lateral —Operación, Directorio, Análisis— se
 * convierten en separadores verticales. Se pierde el nombre del grupo y se
 * conserva la agrupación, que es lo que de verdad ayuda a encontrar algo.
 */
export function NavSuperior() {
  const pathname = usePathname();
  const { can, business } = useSession();
  const marca = useBrand();

  const secciones = React.useMemo(
    () =>
      NAVIGATION.map((seccion) => ({
        ...seccion,
        items: seccion.items.filter(
          (item) => !item.permission || can(item.permission),
        ),
      })).filter((seccion) => seccion.items.length > 0),
    [can],
  );

  return (
    <nav
      aria-label="Navegación principal"
      className="shrink-0 border-b border-line bg-surface"
    >
      <div className="scroll-slim flex items-stretch gap-1 overflow-x-auto px-2">
        {/* Identidad en línea con las pestañas: sin barra lateral, este es el
            único sitio donde cabe sin robar una fila entera de alto. */}
        <span className="mr-2 flex shrink-0 items-center gap-2 pl-1 pr-3">
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded bg-accent text-accent-ink [&_svg]:size-3.5"
            dangerouslySetInnerHTML={{ __html: marca.icono }}
          />
          <span className="truncate text-[13px] font-semibold text-ink">
            {business.name}
          </span>
        </span>

        {secciones.map((seccion, indice) => (
          <React.Fragment key={seccion.label ?? `s-${indice}`}>
            {indice > 0 && (
              <span aria-hidden className="my-2 w-px shrink-0 bg-line" />
            )}

            {seccion.items.map((item) => {
              const activo =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
              const Icono = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={activo ? "page" : undefined}
                  data-tour={item.tourId}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 py-2.5 text-[13.5px] transition-colors duration-150",
                    // El subrayado es lo que convierte esto en pestañas y no
                    // en una fila de enlaces: dice que el contenido de abajo
                    // pertenece a la que está marcada.
                    "border-b-2",
                    activo
                      ? "border-accent font-medium text-accent"
                      : "border-transparent text-ink-muted hover:text-ink",
                  )}
                >
                  <Icono
                    className={cn(
                      "size-4 shrink-0",
                      activo ? "text-accent" : "text-ink-subtle",
                    )}
                    aria-hidden
                  />
                  {item.label}
                </Link>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </nav>
  );
}
