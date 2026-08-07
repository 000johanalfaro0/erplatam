"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, ShieldCheck } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal, ModalContent } from "@/components/ui/overlay";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Skeleton,
} from "@/components/ui/surface";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { PERMISSIONS } from "@/server/core/permissions";

/**
 * USUARIOS
 *
 * Lo que se ve aquí está pensado para responder tres preguntas que el dueño
 * se hace de verdad: quién puede entrar, qué puede tocar cada uno, y quién
 * lleva tiempo sin aparecer.
 *
 * Por eso la tabla muestra el último acceso en lenguaje natural ("hace 3
 * días") en vez de una fecha exacta: nadie necesita el minuto, y "hace tres
 * meses" salta a la vista de una forma que "12/05/2026" no.
 *
 * No hay botón de borrar, y no es un olvido: un usuario borrado dejaría sin
 * autor sus ventas y su rastro de auditoría. Se desactiva.
 */

interface Usuario {
  id: string;
  name: string;
  email: string;
  status: "ACTIVE" | "INACTIVE";
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
  role: { id: string; key: string; name: string };
}

interface Rol {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  _count: { users: number };
}

export default function UsuariosClient() {
  const { can, user: yo, business } = useSession();
  const puedeEscribir = can(PERMISSIONS.USERS_WRITE);
  const queryClient = useQueryClient();

  const [creando, setCreando] = React.useState(false);
  const [restableciendo, setRestableciendo] = React.useState<Usuario | null>(
    null,
  );

  const { data: usuarios, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<Usuario[]>("/users"),
  });

  const { data: roles } = useQuery({
    queryKey: ["users", "roles"],
    queryFn: () => api.get<Rol[]>("/users/roles"),
  });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["users"] });
  }

  const cambiar = useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: Partial<Usuario> & { roleId?: string } }) =>
      api.patch(`/users/${id}`, cambios),
    onSuccess: () => {
      toast.success("Usuario actualizado");
      invalidar();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader
        title="Usuarios"
        description={`Quién puede entrar a ${business.name} y qué puede hacer.`}
        actions={
          puedeEscribir && (
            <Button onClick={() => setCreando(true)}>
              <Plus />
              Nuevo usuario
            </Button>
          )
        }
      />

      <div className="space-y-5">
        <Card>
          <CardBody className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : !usuarios?.length ? (
              <EmptyState
                title="No hay usuarios"
                description="Algo va mal: al menos deberías estar tú."
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-[12px] text-ink-subtle">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Persona</th>
                    <th className="px-4 py-2.5 font-medium">Rol</th>
                    <th className="px-4 py-2.5 font-medium">Último acceso</th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {usuarios.map((usuario) => {
                    const esYo = usuario.id === yo.id;
                    const bloqueado =
                      usuario.lockedUntil &&
                      new Date(usuario.lockedUntil) > new Date();

                    return (
                      <tr
                        key={usuario.id}
                        className={
                          usuario.status === "INACTIVE" ? "opacity-60" : ""
                        }
                      >
                        <td className="px-4 py-3">
                          <span className="block text-ink">
                            {usuario.name}
                            {esYo && (
                              <span className="ml-1.5 text-[12px] text-ink-subtle">
                                (tú)
                              </span>
                            )}
                          </span>
                          <span className="block text-[12px] text-ink-subtle">
                            {usuario.email}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          {puedeEscribir && !esYo ? (
                            <Select
                              aria-label={`Rol de ${usuario.name}`}
                              value={usuario.role.id}
                              className="h-8 w-40"
                              onChange={(e) =>
                                cambiar.mutate({
                                  id: usuario.id,
                                  cambios: { roleId: e.target.value },
                                })
                              }
                            >
                              {roles?.map((rol) => (
                                <option key={rol.id} value={rol.id}>
                                  {rol.name}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <span className="text-ink-muted">
                              {usuario.role.name}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-ink-muted">
                          {usuario.lastLoginAt
                            ? timeAgo(usuario.lastLoginAt)
                            : "Nunca ha entrado"}
                          {usuario.status === "INACTIVE" && (
                            <Badge tone="neutral" className="ml-2">
                              Desactivado
                            </Badge>
                          )}
                          {bloqueado && (
                            <Badge tone="warning" className="ml-2">
                              Bloqueado por intentos fallidos
                            </Badge>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          {puedeEscribir && (
                            <span className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setRestableciendo(usuario)}
                              >
                                <KeyRound />
                                Contraseña
                              </Button>

                              {!esYo && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    cambiar.mutate({
                                      id: usuario.id,
                                      cambios: {
                                        status:
                                          usuario.status === "ACTIVE"
                                            ? "INACTIVE"
                                            : "ACTIVE",
                                      },
                                    })
                                  }
                                >
                                  {usuario.status === "ACTIVE"
                                    ? "Desactivar"
                                    : "Reactivar"}
                                </Button>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        {roles && <TarjetaRoles roles={roles} />}
      </div>

      {creando && (
        <ModalNuevoUsuario
          roles={roles ?? []}
          onClose={() => setCreando(false)}
          onCreated={() => {
            setCreando(false);
            invalidar();
          }}
        />
      )}

      {restableciendo && (
        <ModalContrasena
          usuario={restableciendo}
          onClose={() => setRestableciendo(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

/**
 * Qué puede hacer cada rol, en cristiano.
 *
 * Se muestra porque asignar un rol sin saber qué concede es firmar en blanco.
 * No se listan los permisos crudos —"sales:void"— sino el número, con la
 * descripción escrita para una persona.
 */
function TarjetaRoles({ roles }: { roles: Rol[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Roles</CardTitle>
      </CardHeader>
      <CardBody className="grid gap-3 sm:grid-cols-3">
        {roles.map((rol) => (
          <div
            key={rol.id}
            className="rounded-md border border-line bg-surface-sunken p-3"
          >
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
              <ShieldCheck className="size-3.5 text-ink-subtle" aria-hidden />
              {rol.name}
            </p>
            <p className="mt-1 text-[12px] leading-snug text-ink-muted">
              {rol.description}
            </p>
            <p className="mt-2 text-[11px] text-ink-subtle">
              {rol._count.users}{" "}
              {rol._count.users === 1 ? "persona" : "personas"}
            </p>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function ModalNuevoUsuario({
  roles,
  onClose,
  onCreated,
}: {
  roles: Rol[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [nombre, setNombre] = React.useState("");
  const [correo, setCorreo] = React.useState("");
  const [contrasena, setContrasena] = React.useState("");
  const [roleId, setRoleId] = React.useState(
    roles.find((r) => r.key === "EMPLOYEE")?.id ?? roles[0]?.id ?? "",
  );

  const crear = useMutation({
    mutationFn: () =>
      api.post("/users", {
        name: nombre.trim(),
        email: correo.trim(),
        password: contrasena,
        roleId,
      }),
    onSuccess: () => {
      toast.success(`${nombre} ya puede entrar`);
      onCreated();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent
        title="Nuevo usuario"
        description="La contraseña se la entregas tú; no se envía ningún correo."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            crear.mutate();
          }}
        >
          <Field label="Nombre" required>
            {(props) => (
              <Input
                {...props}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="María López"
                autoFocus
              />
            )}
          </Field>

          <Field label="Correo electrónico" required>
            {(props) => (
              <Input
                {...props}
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="maria@negocio.mx"
              />
            )}
          </Field>

          <Field
            label="Contraseña inicial"
            required
            hint="Mínimo 8 caracteres, con al menos una letra y un número."
          >
            {(props) => (
              <Input
                {...props}
                type="text"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                placeholder="Se la dictas en persona"
              />
            )}
          </Field>

          <Field label="Rol" required>
            {(props) => (
              <Select
                {...props}
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
              >
                {roles.map((rol) => (
                  <option key={rol.id} value={rol.id}>
                    {rol.name} — {rol.description}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={crear.isPending}>
              Crear usuario
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function ModalContrasena({
  usuario,
  onClose,
}: {
  usuario: Usuario;
  onClose: () => void;
}) {
  const [contrasena, setContrasena] = React.useState("");

  const restablecer = useMutation({
    mutationFn: () => api.patch(`/users/${usuario.id}`, { password: contrasena }),
    onSuccess: () => {
      toast.success(`Contraseña de ${usuario.name} restablecida`);
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent
        title={`Contraseña de ${usuario.name}`}
        description="Al cambiarla se cierran todas sus sesiones abiertas."
        size="sm"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            restablecer.mutate();
          }}
        >
          <Field
            label="Nueva contraseña"
            required
            hint="Mínimo 8 caracteres, con al menos una letra y un número."
          >
            {(props) => (
              <Input
                {...props}
                type="text"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                autoFocus
              />
            )}
          </Field>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={restablecer.isPending}>
              Restablecer
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
