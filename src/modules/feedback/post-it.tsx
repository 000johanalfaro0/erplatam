"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * PAPEL ADHESIVO
 * ===========================================================================
 * Lo que hace que algo se lea como un post-it y no como una tarjeta amarilla
 * es un conjunto de detalles pequeños, ninguno de los cuales es el color:
 *
 *   · ESQUINAS RECTAS. El papel no tiene radio. Un `rounded-md` basta para
 *     que el cerebro lo clasifique como "componente de interfaz".
 *   · SIN BORDE. El papel no tiene trazo de 1px. Lo que define su silueta es
 *     la sombra, no una línea.
 *   · ROTACIÓN. Nadie pega un papel perfectamente recto. Un par de grados de
 *     inclinación es la señal más barata y más eficaz de las cinco.
 *   · LA BANDA DE PEGAMENTO. La franja superior refleja distinto porque
 *     debajo hay adhesivo. Se imita con una sombra interior en el borde de
 *     arriba, y es lo que da la sensación de "pegado", no de "flotando".
 *   · SOMBRA ASIMÉTRICA. Un post-it toca la superficie por arriba y se
 *     despega por abajo, así que la sombra es mínima arriba y se abre hacia
 *     abajo. Una sombra uniforme lo devuelve a "tarjeta".
 *
 * Y la letra manuscrita, claro. Pero la letra sola sobre una tarjeta
 * redondeada con borde no engaña a nadie.
 *
 * POR QUÉ COLORES FIJOS Y NO LOS DEL TEMA: un post-it es un objeto físico
 * que alguien dejó encima de la pantalla. No debería cambiar de color porque
 * el sistema esté en modo oscuro, igual que no cambia si apagas la luz de la
 * oficina. Y esa independencia hace además que siempre destaque sobre el
 * fondo, que es exactamente para lo que sirve.
 */

/** Los cuatro colores del taco clásico. */
const PAPELES = [
  { base: "#FDF08A", claro: "#FEF7BC", canto: "#E8D765" }, // canario
  { base: "#FFB8C6", claro: "#FFD5DD", canto: "#EA9CAB" }, // rosa
  { base: "#C3F0A8", claro: "#DDF8CC", canto: "#A6D68B" }, // verde
  { base: "#AEDCF5", claro: "#D2ECFA", canto: "#93C3DD" }, // azul
] as const;

/**
 * Hash estable de la cadena.
 *
 * El color y la inclinación se derivan del identificador de la nota, no de
 * `Math.random()`. Si fueran aleatorios, cada re-render giraría los papeles y
 * la pantalla parecería estar temblando.
 */
function hash(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) {
    h = (h * 31 + texto.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function papelDe(semilla: string) {
  const h = hash(semilla);
  const papel = PAPELES[h % PAPELES.length];
  // De -2.6° a +2.6°, en pasos irregulares para que no se note el patrón.
  const giro = ((h % 27) - 13) / 5;
  return { ...papel, giro };
}

export function PostIt({
  semilla,
  className,
  style,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { semilla: string }) {
  const { base, claro, canto, giro } = papelDe(semilla);

  return (
    <div
      className={cn(
        // Sin radio y sin borde: es papel.
        "text-[#2b2a24] antialiased",
        className,
      )}
      style={{
        // El degradado va de claro a base en el primer 15%: es el brillo de
        // la banda engomada, que refleja distinto que el resto de la hoja.
        background: `linear-gradient(168deg, ${claro} 0%, ${base} 14%, ${base} 100%)`,
        boxShadow: [
          // Contacto con la superficie, muy pegado arriba.
          "0 1px 1px rgba(20,16,4,0.14)",
          // La hoja se despega hacia abajo: sombra desplazada y difusa.
          "0 9px 14px -8px rgba(20,16,4,0.34)",
          // Banda de pegamento: sombra interior solo en el borde superior.
          `inset 0 14px 12px -14px ${canto}`,
          // Canto inferior, para que el papel tenga grosor.
          `inset 0 -2px 0 0 ${canto}55`,
        ].join(", "),
        transform: `rotate(${giro}deg)`,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
