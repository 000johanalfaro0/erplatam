import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Superficies y elementos de presentación: Card, Badge, Separator, Skeleton,
 * EmptyState.
 *
 * Van juntos porque son puramente visuales, sin estado ni interacción. Tenerlos
 * en un solo archivo evita una explosión de módulos de veinte líneas.
 */

// --- Card ------------------------------------------------------------------

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-surface border border-line rounded-lg shadow-subtle",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-5 py-4 border-b border-line",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-[15px] font-semibold text-ink", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-[13px] text-ink-muted", className)} {...props} />
  );
}

export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 px-5 py-3.5 border-t border-line bg-surface-sunken rounded-b-lg",
        className,
      )}
      {...props}
    />
  );
}

// --- Badge -----------------------------------------------------------------

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-surface-sunken text-ink-muted border border-line",
        accent: "bg-accent-soft text-accent border border-accent/15",
        positive: "bg-positive-soft text-positive border border-positive/15",
        warning: "bg-warning-soft text-warning border border-warning/20",
        danger: "bg-danger-soft text-danger border border-danger/15",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

// --- Separator -------------------------------------------------------------

export function Separator({
  className,
  orientation = "horizontal",
}: {
  className?: string;
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "bg-line",
        orientation === "horizontal" ? "h-px w-full" : "w-px self-stretch",
        className,
      )}
    />
  );
}

// --- Skeleton --------------------------------------------------------------

/**
 * Marcador de carga.
 *
 * `aria-hidden` a propósito: un lector de pantalla no debe anunciar bloques
 * grises. El estado de carga se comunica con `aria-busy` en el contenedor.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-sm bg-surface-sunken", className)}
      {...props}
    />
  );
}

/** Esqueleto con la forma de una tabla, para no provocar salto de layout. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="p-1" aria-busy="true" aria-label="Cargando datos">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-0"
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className="h-4"
              style={{
                // Anchos irregulares: un esqueleto de columnas idénticas se ve
                // más artificial que la propia tabla.
                width: colIndex === 0 ? "28%" : `${12 + ((colIndex * 7) % 10)}%`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// --- EmptyState ------------------------------------------------------------

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  /** Qué hacer a continuación. Un vacío sin salida es un callejón. */
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex size-11 items-center justify-center rounded-lg bg-surface-sunken text-ink-subtle [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// --- PageHeader ------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-4 mb-6",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-ink-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
