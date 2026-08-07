import { z } from "zod";

import { PASSWORD_MIN_LENGTH } from "./password";

/**
 * Contratos de entrada del módulo de autenticación.
 *
 * Los mensajes están en español porque llegan directamente a la interfaz.
 */

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Escribe tu correo electrónico")
    .email("El correo electrónico no tiene un formato válido")
    .max(255),
  password: z
    .string()
    .min(1, "Escribe tu contraseña")
    // Sin longitud mínima al iniciar sesión: la política se aplica al crear la
    // contraseña, no al usarla. Exigirla aquí solo revelaría la política a
    // quien intenta adivinar.
    .max(200, "La contraseña es demasiado larga"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Política de contraseñas. Se aplica al crear usuarios y al cambiarlas. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(200, "Máximo 200 caracteres")
  .regex(/[a-zA-Z]/, "Debe incluir al menos una letra")
  .regex(/\d/, "Debe incluir al menos un número");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Escribe tu contraseña actual"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "La nueva contraseña debe ser distinta de la actual",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
