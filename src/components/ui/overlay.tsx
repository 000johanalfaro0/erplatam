"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { AlertTriangle, X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

import { Button } from "./button";

/**
 * Capas superpuestas: Modal, Drawer, DropdownMenu, Tooltip y
 * ConfirmationDialog.
 *
 * Se construyen sobre Radix porque resuelve correctamente lo que casi siempre
 * se implementa mal a mano: atrapar el foco dentro del diálogo, devolverlo al
 * elemento que lo abrió, cerrar con Escape, marcar el resto de la página como
 * inerte para lectores de pantalla y bloquear el desplazamiento del fondo.
 *
 * Ese trabajo correcto de accesibilidad es, además, lo que hace que un agente
 * de automatización pueda operar los diálogos: tienen `role="dialog"`, nombre
 * accesible y estado determinista.
 */

// --- Modal -----------------------------------------------------------------

export const Modal = DialogPrimitive.Root;
export const ModalTrigger = DialogPrimitive.Trigger;
export const ModalClose = DialogPrimitive.Close;

const overlayClasses = [
  "fixed inset-0 z-50 bg-ink/20 backdrop-blur-[2px]",
  "data-[state=open]:animate-in data-[state=open]:fade-in-0",
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
].join(" ");

export interface ModalContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  title: string;
  description?: string;
  /** Ancho máximo. Los formularios largos usan "lg". */
  size?: "sm" | "md" | "lg";
  footer?: React.ReactNode;
}

const modalSizes = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

export const ModalContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  ModalContentProps
>(function ModalContent(
  { className, title, description, size = "md", footer, children, ...props },
  ref,
) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClasses} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2",
          "bg-surface-raised border border-line rounded-lg shadow-overlay",
          "max-h-[calc(100vh-4rem)] flex flex-col",
          "duration-150 ease-[cubic-bezier(0.25,1,0.5,1)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          modalSizes[size],
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-[15px] font-semibold text-ink">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-[13px] text-ink-muted">
                {description}
              </DialogPrimitive.Description>
            ) : (
              // Radix advierte si falta descripción; se declara explícitamente
              // que no la hay en lugar de silenciar el aviso.
              <DialogPrimitive.Description className="sr-only">
                {title}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Cerrar">
              <X />
            </Button>
          </DialogPrimitive.Close>
        </div>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {children}
        </div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-sunken px-5 py-3.5 rounded-b-lg">
            {footer}
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

// --- Drawer ----------------------------------------------------------------

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;

export interface DrawerContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  title: string;
  description?: string;
  footer?: React.ReactNode;
  width?: "md" | "lg" | "xl";
}

const drawerWidths = {
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-2xl",
} as const;

/**
 * Panel lateral.
 *
 * Se usa en lugar de un modal cuando el formulario es largo o cuando conviene
 * seguir viendo la tabla de fondo — editar un producto sin perder de vista la
 * lista, por ejemplo.
 */
export const DrawerContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  DrawerContentProps
>(function DrawerContent(
  { className, title, description, footer, width = "lg", children, ...props },
  ref,
) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClasses} />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col",
          "bg-surface-raised border-l border-line shadow-overlay",
          "duration-200 ease-[cubic-bezier(0.25,1,0.5,1)]",
          "data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
          "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right",
          drawerWidths[width],
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-[15px] font-semibold text-ink">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-[13px] text-ink-muted">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">
                {title}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Cerrar">
              <X />
            </Button>
          </DialogPrimitive.Close>
        </div>

        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-5">
          {children}
        </div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-sunken px-5 py-3.5">
            {footer}
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

// --- DropdownMenu ----------------------------------------------------------

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(function DropdownMenuContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-44 overflow-hidden p-1",
          "bg-surface-raised border border-line rounded-md shadow-overlay",
          "duration-100 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
});

export const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & {
    tone?: "default" | "danger";
  }
>(function DropdownMenuItem({ className, tone = "default", ...props }, ref) {
  return (
    <DropdownPrimitive.Item
      ref={ref}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm outline-none",
        "transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-subtle",
        tone === "danger"
          ? "text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger"
          : "text-ink data-[highlighted]:bg-surface-sunken",
        className,
      )}
      {...props}
    />
  );
});

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return (
    <DropdownPrimitive.Separator
      className={cn("my-1 h-px bg-line", className)}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>) {
  return (
    <DropdownPrimitive.Label
      className={cn(
        "px-2.5 py-1.5 text-[12px] font-medium text-ink-subtle",
        className,
      )}
      {...props}
    />
  );
}

// --- Tooltip ---------------------------------------------------------------

export const TooltipProvider = TooltipPrimitive.Provider;

/**
 * Pista contextual.
 *
 * Un tooltip nunca debe contener información imprescindible: no existe en
 * pantallas táctiles y no lo alcanza quien navega solo con teclado.
 */
export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 max-w-64 rounded-sm bg-ink px-2 py-1 text-[12px] text-canvas shadow-overlay",
            "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0",
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// --- ConfirmationDialog ----------------------------------------------------

export interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Debe explicar la CONSECUENCIA, no repetir la pregunta. */
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  /** Contenido extra: campo de motivo, resumen de lo que se va a afectar. */
  children?: React.ReactNode;
}

/**
 * Confirmación para acciones destructivas (requisito 29).
 *
 * El botón de confirmación NO recibe el foco inicial: se lo lleva el de
 * cancelar. Así, pulsar Enter por inercia no destruye nada.
 */
export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger",
  loading,
  onConfirm,
  children,
}: ConfirmationDialogProps) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClasses} />
        <DialogPrimitive.Content
          role="alertdialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
            "bg-surface-raised border border-line rounded-lg shadow-overlay p-5",
            "duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]",
          )}
        >
          <div className="flex gap-3.5">
            {tone === "danger" && (
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-danger-soft text-danger">
                <AlertTriangle className="size-4.5" aria-hidden />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-[15px] font-semibold text-ink">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                {description}
              </DialogPrimitive.Description>
              {children && <div className="mt-4">{children}</div>}
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <DialogPrimitive.Close asChild>
              <Button ref={cancelRef} variant="secondary" disabled={loading}>
                {cancelLabel}
              </Button>
            </DialogPrimitive.Close>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              loading={loading}
              onClick={() => void onConfirm()}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Modal>
  );
}
