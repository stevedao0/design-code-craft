import { apiRequest } from "./apiClient";

export const TOKEN_KEY = "vcpmc_new_app_access_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

// Alias for convenience - wraps getStoredToken
export function getToken(): string | null {
  return getStoredToken();
}

export type ApiUser = {
  id: number;
  email?: string | null;
  username: string;
  display_name: string;
  role: string;
  is_active: boolean;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  user: ApiUser;
};

export type DomainPermission = {
  can_access: boolean;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_print_test: boolean;
  can_print_official: boolean;
  can_approve: boolean;
  is_active: boolean;
};

export type Domain = {
  id: number;
  code: string;
  name_vi: string;
  workspace_group_code: string;
  permissions: DomainPermission;
};

export type MeResponse = {
  user: ApiUser;
  permissions: string[];
  domains: Domain[];
  active_domain_id?: number | null;
  active_workspace_group_code?: string | null;
};

export function login(username: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: { username, password }
  });
}

export function devLogin(): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/dev/auth-token", {
    method: "POST"
  });
}

export function getMe(token: string): Promise<MeResponse> {
  return apiRequest<MeResponse>("/me", { token });
}

export function logout(): void {
  // No server-side blacklist in this phase, local logout is enough.
}
