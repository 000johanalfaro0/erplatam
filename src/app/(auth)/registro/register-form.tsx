"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { COUNTRY_OPTIONS } from "@/config/countries";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, CardBody } from "@/components/ui/surface";
import { ApiError, api } from "@/lib/api";

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = React.useState({
    businessName: "", name: "", email: "", countryCode: "PE",
    password: "", confirmPassword: "",
  });
  const mutation = useMutation({
    mutationFn: () => api.post("/auth/register", form),
    onSuccess: () => { router.replace("/"); router.refresh(); },
  });
  const error = mutation.error instanceof ApiError ? mutation.error : null;
  const errors = error?.fieldErrors ?? {};
  const set = (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Card><CardBody>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-ink">Crea tu empresa</h1>
        <p className="mt-1 text-sm text-ink-muted">Configura ERPLatam y entra como administrador.</p>
      </div>
      <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
        {error && <div role="alert" className="flex gap-2.5 rounded-md border border-danger/20 bg-danger-soft px-3 py-2.5 text-[13px] text-ink"><AlertCircle className="mt-px size-4 shrink-0 text-danger" aria-hidden />{error.message}</div>}
        <Field label="Nombre del negocio" error={errors.businessName} required>{(props) => <Input {...props} name="businessName" autoFocus value={form.businessName} onChange={set("businessName")} disabled={mutation.isPending} />}</Field>
        <Field label="Tu nombre" error={errors.name} required>{(props) => <Input {...props} name="name" autoComplete="name" value={form.name} onChange={set("name")} disabled={mutation.isPending} />}</Field>
        <Field label="País" error={errors.countryCode} required>{(props) => <Select {...props} name="countryCode" value={form.countryCode} onChange={set("countryCode")} disabled={mutation.isPending}>{COUNTRY_OPTIONS.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</Select>}</Field>
        <Field label="Correo electrónico" error={errors.email} required>{(props) => <Input {...props} type="email" name="email" autoComplete="email" value={form.email} onChange={set("email")} disabled={mutation.isPending} />}</Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres, con letras y números." error={errors.password} required>{(props) => <Input {...props} type="password" name="password" autoComplete="new-password" value={form.password} onChange={set("password")} disabled={mutation.isPending} />}</Field>
        <Field label="Confirmar contraseña" error={errors.confirmPassword} required>{(props) => <Input {...props} type="password" name="confirmPassword" autoComplete="new-password" value={form.confirmPassword} onChange={set("confirmPassword")} disabled={mutation.isPending} />}</Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={mutation.isPending}>Crear cuenta</Button>
        <p className="text-center text-[13px] text-ink-muted">¿Ya tienes cuenta? <Link href="/login" className="font-medium text-accent hover:underline">Inicia sesión</Link></p>
      </form>
    </CardBody></Card>
  );
}
