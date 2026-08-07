import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Botón.
 *
 * Variantes deliberadamente pocas. Un sistema con nueve estilos de botón es un
 * sistema donde nadie sabe cuál usar:
 *
 *   primary   — la acción principal de la pantalla. Una sola por vista.
 *   secondary — acciones habituales con borde.
 *   ghost     — acciones terciarias, barras de herramientas, iconos.
 *   danger    — destructivas. Siempre acompañadas de confirmación.
 *   link      — navegación disfrazada de texto.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-medium select-none",
    "transition-[background-color,border-color,color,opacity] duration-150",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:shrink-0 [&_svg]:size-4",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-ink hover:bg-accent-hover shadow-subtle",
        secondary:
          "bg-surface text-ink border border-line-strong hover:bg-surface-sunken shadow-subtle",
        ghost: "text-ink-muted hover:bg-surface-sunken hover:text-ink",
        danger: "bg-danger text-white hover:bg-danger-hover shadow-subtle",
        link: "text-accent underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-[13px] rounded-sm",
        md: "h-9 px-3.5 text-sm rounded-md",
        lg: "h-11 px-5 text-[15px] rounded-md",
        icon: "size-9 rounded-md",
        "icon-sm": "size-8 rounded-sm",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Renderiza el hijo en lugar de un <button>. Para envolver <Link>. */
  asChild?: boolean;
  /**
   * Muestra un indicador y deshabilita el botón.
   *
   * Importa para la automatización: mientras `loading` es true el botón está
   * deshabilitado, así que un agente que espera a que se habilite tiene una
   * señal determinista de que la operación terminó.
   */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant, size, asChild, loading, children, disabled, ...props },
    ref,
  ) {
    const Component = asChild ? Slot : "button";

    return (
      <Component
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            {children}
          </>
        ) : (
          children
        )}
      </Component>
    );
  },
);

export { buttonVariants };
