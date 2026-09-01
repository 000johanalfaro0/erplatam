import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { getOptionalContext } from "@/server/http/context";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function RegisterPage() {
  if (await getOptionalContext()) redirect("/");
  return (
    <main id="contenido" className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8"><BrandMark /></div>
        <RegisterForm />
      </div>
    </main>
  );
}
