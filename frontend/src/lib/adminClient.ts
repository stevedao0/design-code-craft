import { apiRequest } from "./apiClient";
import { getStoredToken } from "./authClient";

export type AdminUser = {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  role: string;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string | null;
  domains: string[];
  permissions: string[];
};

export type PermissionMatrix = {
  available_permissions: string[];
  permission_labels: Record<string, string>;
  available_roles: string[];
  available_domains: AdminDomain[];
  role_defaults: Record<string, string[]>;
};

export type AdminDomain = {
  id: number;
  code: string;
  name_vi: string;
  workspace_group_code: string;
};

export type RolePermissionsPayload = {
  role: string;
  permissions: string[];
  domain_ids: number[];
};

export type RolePermissionsResponse = {
  ok: boolean;
  user_id: number;
  updated_role: string;
  updated_permissions_count: number;
  updated_domains_count: number;
  warnings: string[];
};

export async function getAdminUsers(): Promise<AdminUser[]> {
  const token = getStoredToken();
  return apiRequest<AdminUser[]>("/users", { method: "GET", token });
}

export async function getPermissionMatrix(): Promise<PermissionMatrix> {
  const token = getStoredToken();
  return apiRequest<PermissionMatrix>("/roles/permissions", { method: "GET", token });
}

export async function updateUserRolePermissions(
  userId: number,
  payload: RolePermissionsPayload
): Promise<RolePermissionsResponse> {
  const token = getStoredToken();
  return apiRequest<RolePermissionsResponse>(
    `/users/${userId}/role-permissions`,
    { method: "PATCH", body: payload, token }
  );
}
