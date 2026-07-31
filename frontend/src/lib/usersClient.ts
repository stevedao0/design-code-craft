import { apiRequest } from "./apiClient";
import { getStoredToken } from "./authClient";

export type UserListItem = {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  role: string;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string | null;
  domains: string[];
};

export type AuditLogEntry = {
  id: string;
  timestamp: string;
  actor: string;
  actor_email: string | null;
  type: "security" | "permission" | "login" | "contract" | "certificate" | "user";
  action: string;
  target: string | null;
  description: string;
};

export type UserCreatePayload = {
  username: string;
  password: string;
  display_name: string;
  role: string;
  domain_ids: number[];
};

export type UserUpdatePayload = {
  display_name?: string;
  role?: string;
  domain_ids?: number[];
};

export async function listUsers(): Promise<UserListItem[]> {
  const token = getStoredToken();
  return apiRequest<UserListItem[]>("/users", { method: "GET", token });
}

export async function createUser(payload: UserCreatePayload): Promise<UserListItem> {
  const token = getStoredToken();
  return apiRequest<UserListItem>("/users", { method: "POST", body: payload, token });
}

export async function updateUser(userId: number, payload: UserUpdatePayload): Promise<UserListItem> {
  const token = getStoredToken();
  return apiRequest<UserListItem>(`/users/${userId}`, { method: "PUT", body: payload, token });
}

export async function deleteUser(userId: number): Promise<void> {
  const token = getStoredToken();
  return apiRequest<void>(`/users/${userId}`, { method: "DELETE", token });
}

export async function lockUser(userId: number): Promise<UserListItem> {
  const token = getStoredToken();
  return apiRequest<UserListItem>(`/users/${userId}/lock`, {
    method: "POST",
    body: { is_active: false },
    token,
  });
}

export async function unlockUser(userId: number): Promise<UserListItem> {
  const token = getStoredToken();
  return apiRequest<UserListItem>(`/users/${userId}/lock`, {
    method: "POST",
    body: { is_active: true },
    token,
  });
}

export async function changeUserPassword(userId: number, newPassword: string): Promise<void> {
  const token = getStoredToken();
  return apiRequest<void>(`/users/${userId}/password`, {
    method: "POST",
    body: { new_password: newPassword },
    token,
  });
}

export async function getAuditLogs(limit = 50, actionType?: string): Promise<AuditLogEntry[]> {
  const token = getStoredToken();
  const params = new URLSearchParams({ limit: String(limit) });
  if (actionType) params.set("action_type", actionType);
  return apiRequest<AuditLogEntry[]>(`/audit?${params.toString()}`, { method: "GET", token });
}

export async function getRolePermissions(): Promise<Record<string, string[]>> {
  const token = getStoredToken();
  return apiRequest<Record<string, string[]>>("/roles/permissions", { method: "GET", token });
}

export async function updateRolePermissions(
  role: string,
  permissions: string[]
): Promise<{ message: string; permissions: string[] }> {
  const token = getStoredToken();
  return apiRequest(`/roles/${role}/permissions`, {
    method: "PUT",
    body: { permissions },
    token,
  });
}
