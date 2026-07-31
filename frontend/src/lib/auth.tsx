import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ROLE_DEFS } from "../data/authData";
import { devLogin as apiDevLogin, getMe, login as apiLogin, logout as apiLogout, MeResponse, TOKEN_KEY } from "./authClient";

type AppRole = "super_admin" | "manager" | "staff";

export type User = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  domains: string[];
  status: "active" | "locked";
  lastLogin: string;
  contractsHandled: number;
  certificatesHandled: number;
  avatarInitial: string;
  backendRole: string;
  backendPermissions: string[];
};

type AuthContextType = {
  currentUser: User | null;
  login: (username: string, pass: string) => Promise<void>;
  devLogin: () => Promise<void>;
  logout: () => void;
  hasPermission: (perm: string) => boolean;
  hasDomain: (domainId: string) => boolean;
  rolePermissions: Record<string, string[]>;
  updateRolePermissions: (roleId: string, perms: string[]) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

function mapBackendRoleToUiRole(role: string): AppRole {
  const normalized = (role || "").toLowerCase();
  if (normalized === "admin") return "super_admin";
  if (normalized === "mod") return "manager";
  return "staff";
}

function pickDomains(payload: MeResponse): string[] {
  // Existing UI domain ids do not match legacy domain codes yet.
  // Keep app accessible in this phase while business domain mapping is pending.
  if (payload.user.role === "admin") return ["__all__"];
  return ["background"];
}

function toUser(payload: MeResponse): User {
  const username = payload.user.username || "";
  const email = payload.user.email || (username.includes("@") ? username : `${username}@vcpmc.org`);
  const displayName = payload.user.display_name || username || email;
  const avatarInitial = (displayName.trim().charAt(0) || "U").toUpperCase();

  return {
    id: String(payload.user.id),
    email,
    name: displayName,
    role: mapBackendRoleToUiRole(payload.user.role),
    domains: pickDomains(payload),
    status: payload.user.is_active ? "active" : "locked",
    lastLogin: new Date().toLocaleString("vi-VN"),
    contractsHandled: 0,
    certificatesHandled: 0,
    avatarInitial,
    backendRole: payload.user.role,
    backendPermissions: payload.permissions || []
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({
    super_admin: ROLE_DEFS.super_admin.permissions,
    manager: ROLE_DEFS.manager.permissions,
    staff: ROLE_DEFS.staff.permissions
  });

  useEffect(() => {
    let cancelled = false;
    async function hydrateUser() {
      if (!token) {
        setCurrentUser(null);
        return;
      }
      try {
        const me = await getMe(token);
        if (!cancelled) setCurrentUser(toUser(me));
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        if (!cancelled) {
          setToken(null);
          setCurrentUser(null);
        }
      }
    }
    hydrateUser();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = async (username: string, pass: string) => {
    const trimmed = (username || "").trim().toLowerCase();
    if (!trimmed || !pass) {
      throw new Error("Vui lòng nhập tài khoản và mật khẩu.");
    }
    try {
      const result = await apiLogin(trimmed, pass);
      const newToken = result.access_token;
      localStorage.setItem(TOKEN_KEY, newToken);
      setToken(newToken);
      const me = await getMe(newToken);
      setCurrentUser(toUser(me));
    } catch (error: any) {
      const message = String(error?.message || "");
      if (message.toLowerCase().includes("invalid username or password")) {
        throw new Error("Sai tài khoản hoặc mật khẩu.");
      }
      throw new Error(message || "Đăng nhập thất bại.");
    }
  };

  const devLogin = async () => {
    try {
      const result = await apiDevLogin();
      const newToken = result.access_token;
      localStorage.setItem(TOKEN_KEY, newToken);
      setToken(newToken);
      const me = await getMe(newToken);
      setCurrentUser(toUser(me));
    } catch (error: any) {
      throw new Error(String(error?.message || "Dev login that bai."));
    }
  };

  const logout = () => {
    apiLogout();
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setCurrentUser(null);
    // Clear in-session route/contract state so the next login does not flash
    // the previous account's last route or active contract.
    try {
      sessionStorage.removeItem('app_route');
      sessionStorage.removeItem('app_active_contract_id');
      sessionStorage.removeItem('app_pending_print_contract_id');
      sessionStorage.removeItem('app_pending_print_certificate_id');
    } catch {
      // sessionStorage may be disabled; ignore.
    }
  };

  const hasPermission = (perm: string) => {
    if (!currentUser) return false;
    // Use backend permissions from API (includes role defaults + per-user overrides)
    if (currentUser.backendPermissions.length > 0) {
      return currentUser.backendPermissions.includes(perm);
    }
    // Fallback to static ROLE_DEFS if backend permissions not loaded yet
    const perms = rolePermissions[currentUser.role] || [];
    return perms.includes(perm);
  };

  const hasDomain = (domainId: string) => {
    if (!currentUser) return false;
    if (currentUser.domains.includes("__all__")) return true;
    return currentUser.domains.includes(domainId);
  };

  const updateRolePermissions = (roleId: string, perms: string[]) => {
    setRolePermissions((prev) => ({
      ...prev,
      [roleId]: perms
    }));
  };

  const value = useMemo(
    () => ({
      currentUser,
      login,
      devLogin,
      logout,
      hasPermission,
      hasDomain,
      rolePermissions,
      updateRolePermissions
    }),
    [currentUser, rolePermissions]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
