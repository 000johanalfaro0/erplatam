import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BRAND } from "@/config/brand";
import { getOptionalContext } from "@/server/http/context";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Quien ya tiene sesión no debería ver el formulario.
  const ctx = await getOptionalContext();
  if (ctx) redirect("/");

  const params = await searchParams;
  const expired = params.expirada === "1";

  return (
    <main
      id="contenido"
      className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-12"
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div
            aria-hidden
            className="mx-auto mb-4 flex size-11 items-center justify-center rounded-lg bg-accent text-lg font-bold text-accent-ink"
          >
            {BRAND.name.charAt(0)}
          </div>
          <h1 className="text-lg font-semibold tracking-[-0.01em] text-ink">
            {BRAND.name}
          </h1>
          <p className="mt-1 text-[13px] text-ink-muted">{BRAND.tagline}</p>
        </div>

        <LoginForm expired={expired} />

        <p className="mt-6 text-center text-[12px] text-ink-subtle">
          Acceso restringido al personal autorizado.
        </p>
      </div>
    </main>
  );
}
