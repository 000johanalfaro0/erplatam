"use client";

import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { queryKeys } from "@/lib/queries";
import type { ReferenceData } from "@/lib/queries";

/**
 * Siembra la caché de TanStack Query con datos ya resueltos en el servidor.
 *
 * PROBLEMA QUE RESUELVE
 * ---------------------------------------------------------------------------
 * Los catálogos de referencia los necesita casi toda pantalla: los
 * desplegables de categoría, proveedor, impuesto y método de pago. Cada
 * pantalla los pedía por su cuenta al montarse, lo que añadía un viaje al
 * servidor —unos 300 ms— antes de poder pintar cualquier formulario.
 *
 * Como el layout protegido YA se resuelve en el servidor (ahí es donde se
 * valida la sesión), traerlos en ese mismo viaje es gratis. Este componente
 * los deposita en la caché antes del primer render, así que `useReference()`
 * los encuentra ya puestos y no pide nada.
 *
 * POR QUÉ SEMBRAR LA CACHÉ Y NO PASARLOS POR PROPS:
 * pasarlos por props obligaría a que cada pantalla los recibiera y los fuera
 * bajando a sus componentes hijos. Sembrando la caché, cualquier componente a
 * cualquier profundidad los obtiene con `useReference()` sin que nadie tenga
 * que cablearlos. Y siguen refrescándose solos cuando caducan.
 *
 * Se usa `useState` con inicializador y no `useEffect` a propósito: debe
 * ocurrir ANTES del primer render de los hijos, no después. Con `useEffect`
 * los hijos ya habrían lanzado su petición.
 */
export function QueryHydrator({
  reference,
  children,
}: {
  reference: ReferenceData;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();

  React.useState(() => {
    queryClient.setQueryData(queryKeys.reference, reference);
    return null;
  });

  return <>{children}</>;
}
