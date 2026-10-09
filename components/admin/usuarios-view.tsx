"use client";

import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";

type Role = "admin" | "encargado" | "mozo" | "cocina";

interface GestionUser {
  id: number;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  encargado: "Encargado",
  mozo: "Mozo",
  cocina: "Cocina",
};

const ROLES: Role[] = ["admin", "encargado", "mozo", "cocina"];

export function UsuariosView() {
  const [users, setUsers] = useState<GestionUser[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newRole, setNewRole] = useState<Role>("mozo");
  const [creating, setCreating] = useState(false);

  function load() {
    fetch("/api/admin/users")
      .then(async (res) => {
        if (res.status === 401) {
          setForbidden(true);
          return;
        }
        const data = await res.json();
        setUsers(data.users ?? []);
      });
  }

  useEffect(load, []);

  async function patch(id: number, changes: Partial<{ name: string; role: Role; active: boolean; pin: string }>) {
    setSavingId(id);
    setError("");
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    const data = await res.json();
    setSavingId(null);
    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar");
      return;
    }
    setUsers((prev) => (prev ?? []).map((u) => (u.id === id ? data.user : u)));
  }

  async function createUser() {
    setCreating(true);
    setError("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, pin: newPin, role: newRole }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo crear el usuario");
      return;
    }
    setUsers((prev) => [...(prev ?? []), data.user]);
    setShowNew(false);
    setNewName("");
    setNewPin("");
    setNewRole("mozo");
  }

  if (forbidden) {
    return (
      <div className="mostrador">
        <h1 style={{ marginBottom: 6 }}>Usuarios</h1>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
          Solo un administrador puede ver y gestionar los usuarios.
        </p>
      </div>
    );
  }

  if (!users) {
    return <div className="mostrador">Cargando usuarios…</div>;
  }

  return (
    <div className="mostrador">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Usuarios</h1>
          <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 20, maxWidth: 520 }}>
            Cada persona entra con su propio PIN. El PIN nunca se muestra ni se guarda en texto plano, y
            cada ingreso/salida queda registrado.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: "none", display: "flex", alignItems: "center", gap: 6 }}
          onClick={() => setShowNew((v) => !v)}
        >
          <UserPlus size={15} />
          Nuevo usuario
        </button>
      </div>

      {error && <div style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

      {showNew && (
        <div className="caja-card" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre"
            className="caja-input"
            style={{ flex: "1 1 160px" }}
          />
          <input
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="PIN (4 a 6 dígitos)"
            inputMode="numeric"
            className="caja-input"
            style={{ flex: "1 1 140px" }}
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as Role)}
            className="caja-input"
            style={{ flex: "1 1 140px" }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            disabled={creating || !newName.trim() || newPin.length < 4}
            onClick={createUser}
          >
            Crear
          </button>
        </div>
      )}

      <table className="m-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Cambiar PIN</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                <input
                  defaultValue={u.name}
                  onBlur={(e) => e.target.value.trim() !== u.name && patch(u.id, { name: e.target.value.trim() })}
                  className="caja-input"
                  style={{ fontSize: 12.5 }}
                  disabled={savingId === u.id}
                />
              </td>
              <td>
                <select
                  value={u.role}
                  onChange={(e) => patch(u.id, { role: e.target.value as Role })}
                  className="caja-input"
                  style={{ fontSize: 12.5 }}
                  disabled={savingId === u.id}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button
                  type="button"
                  className={`pill ${u.active ? "cerrada" : "encurso"}`}
                  style={{ cursor: "pointer", border: "none" }}
                  onClick={() => patch(u.id, { active: !u.active })}
                  disabled={savingId === u.id}
                >
                  {u.active ? "Activo" : "Inactivo"}
                </button>
              </td>
              <td>
                <input
                  type="text"
                  placeholder="Nuevo PIN"
                  inputMode="numeric"
                  className="caja-input"
                  style={{ fontSize: 12.5, width: 110 }}
                  disabled={savingId === u.id}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    const value = e.currentTarget.value.replace(/\D/g, "");
                    if (value.length >= 4) {
                      patch(u.id, { pin: value });
                      e.currentTarget.value = "";
                    }
                  }}
                  onChange={(e) => {
                    e.currentTarget.value = e.currentTarget.value.replace(/\D/g, "").slice(0, 6);
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
