"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Campo de importe.
 *
 * FRONTERA CRÍTICA DEL SISTEMA.
 *
 * El usuario escribe texto ("1,234.56"). El resto de la aplicación opera con
 * enteros en centavos (123456). Este componente es el único punto donde ocurre
 * esa conversión — y por tanto el único sitio donde podría colarse un número
 * en coma flotante.
 *
 * Detalles que importan:
 *
 *   - `inputMode="decimal"` abre el teclado numérico en tablet, que es donde
 *     se cobra.
 *   - Se aceptan comas de millar al escribir y se limpian al confirmar.
 *   - No se reformatea mientras el usuario teclea: reescribir el valor a mitad
 *     de la escritura mueve el cursor y es exasperante. El formato se aplica al
 *     salir del campo.
 *   - Un valor inválido NO se descarta en silencio: se conserva el texto y se
 *     avisa. Borrar lo que alguien escribió sin decírselo es peor que un error.
 */

export interface MoneyInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type"
  > {
  /** Valor en centavos. */
  valueCents: number;
  /** Se invoca con el nuevo valor en centavos. */
  onValueChange: (cents: number) => void;
  /** Símbolo mostrado a la izquierda. */
  currencySymbol?: string;
}

function centsToText(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Convierte texto a centavos. Devuelve null si no es un importe válido. */
function textToCents(text: string): number | null {
  const cleaned = text.trim().replace(/[\s,$]/g, "");
  if (cleaned === "") return 0;
  if (!/^\d*\.?\d{0,2}$/.test(cleaned)) return null;

  const [whole = "0", fraction = ""] = cleaned.split(".");
  // Se opera sobre las cifras como enteros, no con parseFloat: nunca entra un
  // número en coma flotante en el camino.
  return Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  function MoneyInput(
    { valueCents, onValueChange, currencySymbol = "$", className, ...props },
    ref,
  ) {
    const [text, setText] = React.useState(() => centsToText(valueCents));
    const [focused, setFocused] = React.useState(false);

    // Sincroniza cuando el valor cambia desde fuera (p. ej. al cargar un
    // producto para editar), pero NO mientras el usuario escribe.
    React.useEffect(() => {
      if (!focused) setText(centsToText(valueCents));
    }, [valueCents, focused]);

    return (
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-subtle"
        >
          {currencySymbol}
        </span>
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onFocus={(event) => {
            setFocused(true);
            // Selecciona todo al enfocar: en una caja se sobrescribe el
            // importe, casi nunca se edita carácter a carácter.
            event.target.select();
          }}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);

            const cents = textToCents(next);
            if (cents !== null) onValueChange(cents);
          }}
          onBlur={() => {
            setFocused(false);
            const cents = textToCents(text);
            // Al salir se normaliza a dos decimales, o se restaura el último
            // valor válido si lo escrito no lo era.
            setText(centsToText(cents ?? valueCents));
            if (cents === null) onValueChange(valueCents);
          }}
          className={cn(
            "w-full bg-surface text-ink numeric",
            "border border-line-strong rounded-md",
            "h-9 pl-7 pr-3 text-sm text-right",
            "transition-colors duration-150",
            "focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20",
            "disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-surface-sunken",
            "aria-[invalid=true]:border-danger",
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);

/**
 * Campo de cantidad, en mili-unidades.
 *
 * Misma idea que el importe pero con tres decimales, para poder vender a
 * granel (0.750 kg).
 */
export interface QuantityInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type"
  > {
  /** Valor en mili-unidades. */
  valueMilli: number;
  onValueChange: (milli: number) => void;
  /** Sufijo de unidad: "kg", "pz". */
  unitLabel?: string;
}

function milliToText(milli: number): string {
  const value = milli / 1000;
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function textToMilli(text: string): number | null {
  const cleaned = text.trim().replace(/[\s,]/g, "");
  if (cleaned === "") return 0;
  if (!/^\d*\.?\d{0,3}$/.test(cleaned)) return null;

  const [whole = "0", fraction = ""] = cleaned.split(".");
  return Number(whole || "0") * 1000 + Number(fraction.padEnd(3, "0"));
}

export const QuantityInput = React.forwardRef<
  HTMLInputElement,
  QuantityInputProps
>(function QuantityInput(
  { valueMilli, onValueChange, unitLabel, className, ...props },
  ref,
) {
  const [text, setText] = React.useState(() => milliToText(valueMilli));
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    if (!focused) setText(milliToText(valueMilli));
  }, [valueMilli, focused]);

  return (
    <div className="relative">
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onFocus={(event) => {
          setFocused(true);
          event.target.select();
        }}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const milli = textToMilli(next);
          if (milli !== null) onValueChange(milli);
        }}
        onBlur={() => {
          setFocused(false);
          const milli = textToMilli(text);
          setText(milliToText(milli ?? valueMilli));
          if (milli === null) onValueChange(valueMilli);
        }}
        className={cn(
          "w-full bg-surface text-ink numeric",
          "border border-line-strong rounded-md",
          "h-9 px-3 text-sm text-right",
          unitLabel && "pr-9",
          "transition-colors duration-150",
          "focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20",
          "disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-surface-sunken",
          className,
        )}
        {...props}
      />
      {unitLabel && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-subtle"
        >
          {unitLabel}
        </span>
      )}
    </div>
  );
});
