"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Controles de formulario.
 *
 * Todos comparten una decisión de accesibilidad que además hace el sistema
 * automatizable (requisito 22): el `<label>` está siempre asociado por `id`, y
 * el mensaje de error se enlaza con `aria-describedby` y `aria-invalid`.
 *
 * Consecuencia práctica: tanto un lector de pantalla como Playwright pueden
 * localizar cualquier campo por su etiqueta visible —
 * `getByLabel("Precio de venta")` — sin necesidad de sembrar `data-testid`
 * artificiales por toda la aplicación.
 */

const controlBase = [
  "w-full bg-surface text-ink",
  "border border-line-strong rounded-md",
  "px-3 text-sm",
  "placeholder:text-ink-subtle",
  "transition-colors duration-150",
  "focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20",
  "disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-surface-sunken",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/20",
].join(" ");

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input ref={ref} className={cn(controlBase, "h-9", className)} {...props} />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(controlBase, "py-2 min-h-20 resize-y", className)}
      {...props}
    />
  );
});

/**
 * Select nativo.
 *
 * Decisión: se usa `<select>` del navegador en lugar de un componente
 * personalizado. Motivos, en orden de peso:
 *
 *   1. Automatización: `selectOption()` de Playwright funciona sin trucos.
 *   2. Accesibilidad: el soporte del navegador es insuperable.
 *   3. Móvil y tablet: abre el selector nativo del sistema, que es mejor que
 *      cualquier imitación.
 *
 * Para casos donde hace falta buscar entre cientos de opciones (elegir un
 * producto al vender) NO se usa esto, sino el buscador dedicado.
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          controlBase,
          "h-9 appearance-none pr-9 cursor-pointer",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden
      >
        <path
          d="m4 6 4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
});

export interface FieldProps {
  label: string;
  /** Texto de ayuda bajo el campo. Se oculta cuando hay error. */
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** Recibe las props que deben ir al control (id, aria-*). */
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => React.ReactNode;
}

/**
 * Envoltorio de campo: etiqueta + control + error, correctamente enlazados.
 *
 * Se usa con render prop para que el control reciba los identificadores
 * generados sin que quien lo usa tenga que acordarse de cablearlos a mano —
 * que es justo donde se rompe la accesibilidad en la práctica.
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  const generatedId = React.useId();
  const id = `field-${generatedId}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={id}
        className="block text-[13px] font-medium text-ink-muted"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        )}
      </label>

      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy,
      })}

      {error ? (
        /* role="alert" hace que el lector de pantalla lo anuncie al aparecer,
           y da a Playwright un selector estable para verificar validaciones. */
        <p id={errorId} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[13px] text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Casilla de verificación con etiqueta clicable. */
export function Checkbox({
  label,
  description,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  description?: string;
}) {
  const generatedId = React.useId();
  const id = props.id ?? `check-${generatedId}`;

  return (
    <div className={cn("flex gap-2.5", className)}>
      <input
        type="checkbox"
        id={id}
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-xs border-line-strong accent-accent"
        {...props}
      />
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="block cursor-pointer text-sm text-ink select-none"
        >
          {label}
        </label>
        {description && (
          <p className="text-[13px] text-ink-subtle">{description}</p>
        )}
      </div>
    </div>
  );
}
