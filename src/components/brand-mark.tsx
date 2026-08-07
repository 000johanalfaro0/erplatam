"use client";

import { useBrand } from "./theme-switcher";

/**
 * Marca del producto: icono, nombre y descriptor de la dirección visual activa.
 *
 * Es cliente porque la dirección la elige el usuario y vive en `localStorage`.
 * El script del layout raíz ya aplicó los colores y la tipografía antes del
 * primer pintado, así que lo único que puede parpadear aquí es el nombre; se
 * asume porque montar el estado de la marca en el servidor obligaría a una
 * cookie, y esto es temporal: cuando el cliente elija dirección, queda fija.
 */
export function BrandMark() {
  const marca = useBrand();

  return (
    <div className="text-center">
      <div
        aria-hidden
        className="mx-auto mb-4 flex size-11 items-center justify-center rounded-lg bg-accent text-accent-ink [&_svg]:size-6"
        dangerouslySetInnerHTML={{ __html: marca.icono }}
      />
      <h1 className="text-lg font-semibold tracking-[-0.01em] text-ink">
        {marca.marca}
      </h1>
      <p className="mt-1 text-[13px] text-ink-muted">{marca.descriptor}</p>
    </div>
  );
}
