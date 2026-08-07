import { TrendingDown, TrendingUp } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Tarjeta de métrica.
 *
 * Reglas de diseño, todas con motivo:
 *
 *   - La cifra domina; la etiqueta va arriba y pequeña. Se lee de un vistazo.
 *   - Sin iconos decorativos junto a cada número: un icono que no aporta
 *     información compite con el dato por la atención.
 *   - La variación solo aparece si hay una referencia real con la que
 *     comparar. "+0%" contra cero ventas es engañoso.
 *   - El color solo aparece en la variación, y solo cuando significa algo.
 */

export interface StatProps {
  label: string;
  value: string;
  /** Contexto bajo la cifra: "12 ventas", "margen 34%". */
  detail?: string;
  /** Variación en basis points. 1250 = +12.5%. */
  changeBps?: number | null;
  /**
   * Si un aumento es bueno. En gastos es al revés: subir es malo.
   */
  higherIsBetter?: boolean;
  className?: string;
}

export function Stat({
  label,
  value,
  detail,
  changeBps,
  higherIsBetter = true,
  className,
}: StatProps) {
  const hasChange = changeBps !== null && changeBps !== undefined;
  const isUp = hasChange && changeBps > 0;
  const isFlat = hasChange && changeBps === 0;
  const isGood = higherIsBetter ? isUp : !isUp;

  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-surface p-4 shadow-subtle",
        className,
      )}
    >
      <p className="text-[12px] font-medium text-ink-muted">{label}</p>

      <p className="numeric mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-ink">
        {value}
      </p>

      <div className="mt-1.5 flex items-center gap-2">
        {hasChange && !isFlat && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[12px] font-medium",
              isGood ? "text-positive" : "text-danger",
            )}
          >
            {isUp ? (
              <TrendingUp className="size-3" aria-hidden />
            ) : (
              <TrendingDown className="size-3" aria-hidden />
            )}
            {isUp ? "+" : ""}
            {(changeBps / 100).toFixed(1)}%
          </span>
        )}
        {detail && (
          <span className="text-[12px] text-ink-subtle">{detail}</span>
        )}
      </div>
    </div>
  );
}
