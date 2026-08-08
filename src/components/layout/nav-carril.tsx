"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { NAVIGATION } from "@/config/navigation";
import { cn } from "@/lib/utils";

import { useSession } from "../session-provider";
import { useBrand } from "../theme-switcher";
import { Tooltip } from "../ui/overlay";

/**
 * NAVEGACIÓN EN CARRIL — dirección "Carril"
 *
 * Sesenta píxeles de iconos, sin etiquetas visibles. Las etiquetas viven en
 * el tooltip y en `aria-label`, así que un lector de pantalla y una prueba
 * automatizada siguen encontrando "Inventario" igual que en la barra lateral
 * con texto: se busca por nombre accesible, no por texto visible. Esa es la
 * razón de que la auditoría de interfaz sobreviva a este cambio sin tocar
 * una línea.
 *
 * QUÉ GANA: 180 px de ancho para el contenido y una pantalla mucho más
 * tranquila. QUÉ CUESTA: hay que aprenderse los iconos. Es una apuesta
 * consciente, y la razón de que esta dirección se describa como "para quien
 * entra unas veces al día" y no para quien pasa aquí ocho horas.
 *
 * Los separadores entre grupos se mantienen: sin etiquetas de sección, son
 * lo único que dice que "Clientes" y "Ventas" no son la misma familia.
 */
export function NavCarril({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useSession();
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
      className="flex h-full w-15 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-3"
    >
      <div
        aria-hidden
        className="mb-2 flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-ink [&_svg]:size-[18px]"
        dangerouslySetInnerHTML={{ __html: marca.icono }}
      />

      {secciones.map((seccion, indice) => (
        <React.Fragment key={seccion.label ?? `s-${indice}`}>
          {indice > 0 && (
            <span aria-hidden className="my-1.5 h-px w-6 shrink-0 bg-line" />
          )}

          {seccion.items.map((item) => {
            const activo =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icono = item.icon;

            return (
              <Tooltip key={item.href} content={item.label} side="right">
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={activo ? "page" : undefined}
                  // El nombre accesible lo pone `aria-label`: sin él este
                  // enlace no tendría nombre para nadie, ni persona ni prueba.
                  aria-label={item.label}
                  data-tour={item.tourId}
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-150",
                    activo
                      ? "bg-accent-soft text-accent"
                      : "text-ink-subtle hover:bg-surface-sunken hover:text-ink",
                  )}
                >
                  <Icono className="size-[18px]" aria-hidden />
                </Link>
              </Tooltip>
            );
          })}
        </React.Fragment>
      ))}
    </nav>
  );
}
