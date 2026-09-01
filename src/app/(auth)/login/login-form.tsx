"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card, CardBody } from "@/components/ui/surface";
import { ApiError, api } from "@/lib/api";

/**
 * Formulario de acceso.
 *
 * Detalles que importan en un punto de venta:
 *
 *   - `autoComplete` correcto para que el gestor de contraseñas funcione.
 *   - Enter envía el formulario (es un `<form>` real, no divs con onClick).
 *   - El error general se anuncia con `role="alert"`.
 *   - El botón queda deshabilitado mientras se envía: evita el doble envío
 *     y da a la automatización una señal determinista de fin de operación.
 */
export function LoginForm({ expired }: { expired: boolean }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);

  const login = useMutation({
    mutationFn: () => api.post("/auth/login", { email, password }),
    onSuccess: () => {
      // `refresh` obliga a los Server Components a releer la sesión recién
      // creada; sin él, el layout protegido seguiría viendo al usuario
      // como anónimo.
      router.replace("/");
      router.refresh();
    },
  });

  const error = login.error instanceof ApiError ? login.error : null;
  const fieldErrors = error?.fieldErrors ?? {};

  return (
    <Card>
      <CardBody>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate();
          }}
          className="space-y-4"
          noValidate
        >
          {expired && !error && (
            <div
              role="status"
              className="flex gap-2.5 rounded-md border border-warning/20 bg-warning-soft px-3 py-2.5 text-[13px] text-ink"
            >
              <AlertCircle className="mt-px size-4 shrink-0 text-warning" aria-hidden />
              Tu sesión expiró por inactividad. Vuelve a iniciar sesión.
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex gap-2.5 rounded-md border border-danger/20 bg-danger-soft px-3 py-2.5 text-[13px] text-ink"
            >
              <AlertCircle className="mt-px size-4 shrink-0 text-danger" aria-hidden />
              {error.message}
            </div>
          )}

          <Field
            label="Correo electrónico"
            error={fieldErrors.email}
            required
          >
            {(props) => (
              <Input
                {...props}
                type="email"
                name="email"
                autoComplete="username"
                autoFocus
                placeholder="tu@negocio.mx"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={login.isPending}
              />
            )}
          </Field>

          <Field label="Contraseña" error={fieldErrors.password} required>
            {(props) => (
              <div className="relative"><Input
                {...props}
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={login.isPending}
                className="pr-10"
              /><button type="button" className="absolute inset-y-0 right-0 grid w-10 place-items-center text-ink-muted" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>
            )}
          </Field>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            loading={login.isPending}
          >
            Iniciar sesión
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
