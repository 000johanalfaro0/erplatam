import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
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
        <div className="mb-8">
          <BrandMark />
        </div>

        <LoginForm expired={expired} />

        <p className="mt-6 text-center text-[12px] text-ink-subtle">
          Acceso restringido al personal autorizado.
        </p>
      </div>
    </main>
  );
}
