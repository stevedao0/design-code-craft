import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import {
  PlusIcon,
  DownloadIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldIcon,
  LockIcon,
  UnlockIcon,
  Edit2Icon,
  KeyIcon,
  Trash2Icon,
  EyeIcon,
  LoaderIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  CalculatorIcon,
} from "lucide-react";
import { Page, PageHeader } from "../components/app-ui/Page";
import { ContentCard } from "../components/app-ui/ContentCard";
import { Button } from "../components/app-ui/Button";
import { Input } from "../components/app-ui/Input";
import { Select } from "../components/app-ui/Select";
import { StatusBadge } from "../components/app-ui/StatusBadge";
import { RowActionsMenu } from "../components/app-ui/RowActionsMenu";
import { Modal } from "../components/app-ui/Modal";
import { Checkbox } from "../components/app-ui/Checkbox";
import { ROLE_DEFS, DOMAINS } from "../data/authData";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  lockUser,
  unlockUser,
  changeUserPassword,
  getAuditLogs,
  UserListItem,
  AuditLogEntry,
} from "../lib/usersClient";
import {
  getPermissionMatrix,
  updateUserRolePermissions,
  PermissionMatrix,
} from "../lib/adminClient";

function mapRoleLabel(role: string): string {
  const r = (role || "").toLowerCase();
  if (r === "admin") return ROLE_DEFS.super_admin.name;
  if (r === "mod") return ROLE_DEFS.manager.name;
  return ROLE_DEFS.staff.name;
}

function mapRoleKey(role: string): string {
  const r = (role || "").toLowerCase();
  if (r === "admin") return "super_admin";
  if (r === "mod") return "manager";
  return "staff";
}

function mapRoleValue(roleKey: string): string {
  if (roleKey === "super_admin") return "admin";
  if (roleKey === "manager") return "mod";
  return "user";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type Toast = {
  id: number;
  type: "success" | "error" | "info";
  message: string;
};

export function UsersPage() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modal states
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordTargetUser, setPasswordTargetUser] = useState<UserListItem | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState<UserListItem | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileUser, setProfileUser] = useState<UserListItem | null>(null);

  // Action loading states
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounter = useRef(0);

  const showToast = useCallback((type: Toast["type"], message: string) => {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    setUserError(null);
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Tải danh sách người dùng thất bại";
      setUserError(msg);
      showToast("error", msg);
    } finally {
      setLoadingUsers(false);
    }
  }, [showToast]);

  const fetchAuditLogs = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const logs = await getAuditLogs(20);
      setAuditLogs(logs);
    } catch {
      // Non-critical — show mock data on failure
      setAuditLogs([]);
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchAuditLogs();
  }, [fetchUsers, fetchAuditLogs]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchUsers();
    await fetchAuditLogs();
    setRefreshing(false);
    showToast("success", "Đã làm mới danh sách");
  };

  const handleExport = () => {
    const rows = [
      ["ID", "Username", "Họ tên", "Email", "Role", "Trạng thái", "Đăng nhập cuối", "Ngày tạo"],
      ...filteredUsers.map((u) => [
        u.id,
        u.username,
        u.display_name,
        u.email || "",
        mapRoleLabel(u.role),
        u.is_active ? "Hoạt động" : "Tạm khóa",
        formatDate(u.last_seen_at),
        formatDate(u.created_at),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("success", "Đã xuất danh sách người dùng");
  };

  const handleLockToggle = async (user: UserListItem) => {
    setActionLoadingId(user.id);
    try {
      if (user.is_active) {
        await lockUser(user.id);
        showToast("success", `Đã khóa tài khoản ${user.username}`);
      } else {
        await unlockUser(user.id);
        showToast("success", `Đã mở khóa tài khoản ${user.username}`);
      }
      await fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Thao tác thất bại";
      showToast("error", msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTargetUser) return;
    setActionLoadingId(deleteTargetUser.id);
    try {
      await deleteUser(deleteTargetUser.id);
      showToast("success", `Đã xóa người dùng ${deleteTargetUser.username}`);
      setShowDeleteModal(false);
      setDeleteTargetUser(null);
      await fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Xóa thất bại";
      showToast("error", msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUserSaved = async () => {
    setShowUserModal(false);
    setEditingUser(null);
    await fetchUsers();
    await fetchAuditLogs();
  };

  const handlePasswordChanged = async () => {
    setShowPasswordModal(false);
    setPasswordTargetUser(null);
    showToast("success", "Đổi mật khẩu thành công");
  };

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    if (
      search &&
      !u.username.toLowerCase().includes(q) &&
      !u.display_name.toLowerCase().includes(q) &&
      !(u.email || "").toLowerCase().includes(q)
    )
      return false;
    if (roleFilter && mapRoleValue(roleFilter) !== u.role) return false;
    if (statusFilter === "active" && !u.is_active) return false;
    if (statusFilter === "locked" && u.is_active) return false;
    return true;
  });

  return (
    <Page>
      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 text-sm font-medium animate-[fadein_0.2s_ease-out] text-white min-w-[280px] ${
              t.type === "success" ? "bg-lime-600" : t.type === "error" ? "bg-rose-600" : "bg-amber-700"
            }`}
          >
            {t.type === "success" && <CheckCircleIcon className="h-5 w-5 shrink-0" />}
            {t.type === "error" && <AlertTriangleIcon className="h-5 w-5 shrink-0" />}
            {t.type === "info" && <CheckCircleIcon className="h-5 w-5 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      <PageHeader
        breadcrumb="/admin/users"
        title="Người dùng"
        description="Quản lý tài khoản, vai trò và phạm vi nghiệp vụ được phép truy cập."
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={
                <RefreshCwIcon className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              }
              onClick={handleRefresh}
              disabled={refreshing}
            >
              Làm mới
            </Button>
            <Button
              variant="secondary"
              leftIcon={<DownloadIcon className="h-4 w-4" />}
              onClick={handleExport}
            >
              Xuất danh sách
            </Button>
            <Button
              variant="primary"
              leftIcon={<PlusIcon className="h-4 w-4" />}
              onClick={() => {
                setEditingUser(null);
                setShowUserModal(true);
              }}
            >
              Thêm người dùng
            </Button>
          </>
        }
      />

      <ContentCard padded={false} accent>
        <div className="p-4 border-b border-zinc-100 flex flex-wrap gap-3 bg-zinc-50/50">
          <div className="relative w-64">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Tìm tên, email, username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-600/20 focus:border-amber-600 transition-all"
            />
          </div>
          <div className="w-40">
            <Select
              value={roleFilter}
              onChange={setRoleFilter}
              placeholder="Tất cả Role"
              options={Object.values(ROLE_DEFS).map((r) => ({ value: r.id, label: r.name }))}
            />
          </div>
          <div className="w-40">
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="Tất cả trạng thái"
              options={[
                { value: "active", label: "Hoạt động" },
                { value: "locked", label: "Tạm khóa" },
              ]}
            />
          </div>
          {loadingUsers && (
            <div className="flex items-center gap-2 text-sm text-zinc-500 ml-auto">
              <LoaderIcon className="h-4 w-4 animate-spin" />
              Đang tải...
            </div>
          )}
          {!loadingUsers && (
            <div className="ml-auto flex items-center text-sm text-zinc-500">
              {filteredUsers.length} / {users.length} người dùng
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          {userError && !loadingUsers ? (
            <div className="p-8 text-center text-rose-600 flex flex-col items-center gap-3">
              <AlertTriangleIcon className="h-8 w-8" />
              <p className="font-medium">{userError}</p>
              <Button variant="secondary" onClick={fetchUsers} size="sm">
                Thử lại
              </Button>
            </div>
          ) : (
            <table className="vc-datatable">
              <thead>
                <tr className="bg-zinc-50/80 border-b border-zinc-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Người dùng
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Domains
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Trạng thái
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Đăng nhập cuối
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Ngày tạo
                  </th>
                  <th className="w-10 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 && !loadingUsers ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-zinc-400">
                      Không có người dùng nào phù hợp
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors"
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-100 to-amber-100 text-amber-800 font-semibold flex items-center justify-center shrink-0">
                            {(u.display_name || u.username).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-zinc-900">{u.display_name || u.username}</p>
                            <p className="text-xs text-zinc-500">{u.email || u.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700 ring-1 ring-inset ring-zinc-200">
                          <ShieldIcon className="h-3 w-3 text-zinc-400" />
                          {mapRoleLabel(u.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top max-w-[200px]">
                        {u.domains.includes("__all__") || u.domains.length === 0 ? (
                          <span className="text-xs font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                            Tất cả
                          </span>
                        ) : (
                          <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed">
                            {u.domains.join(", ")}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <StatusBadge tone={u.is_active ? "success" : "danger"} dot>
                          {u.is_active ? "Hoạt động" : "Tạm khóa"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-600 tabular-nums">
                        {formatDate(u.last_seen_at)}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-zinc-600 tabular-nums">
                        {formatDate(u.created_at)}
                      </td>
                      <td className="pr-4 py-3 align-top text-right">
                        <RowActionsMenu
                          actions={[
                            {
                              label: "Xem hồ sơ",
                              icon: <EyeIcon className="h-4 w-4" />,
                              onClick: () => {
                                setProfileUser(u);
                                setShowProfileModal(true);
                              },
                            },
                            {
                              label: "Chỉnh sửa",
                              icon: <Edit2Icon className="h-4 w-4" />,
                              onClick: () => {
                                setEditingUser(u);
                                setShowUserModal(true);
                              },
                            },
                            {
                              label: "Đổi mật khẩu",
                              icon: <KeyIcon className="h-4 w-4" />,
                              onClick: () => {
                                setPasswordTargetUser(u);
                                setShowPasswordModal(true);
                              },
                            },
                            {
                              label: u.is_active ? "Khóa tài khoản" : "Mở khóa",
                              icon:
                                u.is_active ? (
                                  <LockIcon className="h-4 w-4" />
                                ) : (
                                  <UnlockIcon className="h-4 w-4" />
                                ),
                              onClick: () => handleLockToggle(u),
                              tone: u.is_active ? "danger" : "default",
                            },
                            {
                              label: "Xóa",
                              icon: <Trash2Icon className="h-4 w-4" />,
                              onClick: () => {
                                if (currentUser && (String(u.id) === String(currentUser.id) || u.username === currentUser.email)) {
                                  showToast("error", "Không thể xóa tài khoản đang đăng nhập.");
                                  return;
                                }
                                setDeleteTargetUser(u);
                                setShowDeleteModal(true);
                              },
                              tone: "danger",
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </ContentCard>

      {/* Audit Log Panel */}
      <div className="mt-6">
        <ContentCard
          title="Nhật ký hoạt động gần đây"
          description="Lịch sử thao tác nghiệp vụ và bảo mật hệ thống."
          padded={false}
        >
          <div className="divide-y divide-zinc-100">
            {loadingAudit ? (
              <div className="p-8 text-center text-zinc-400 flex items-center justify-center gap-2">
                <LoaderIcon className="h-4 w-4 animate-spin" />
                Đang tải nhật ký...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-8 text-center text-zinc-400">Chưa có nhật ký hoạt động</div>
            ) : (
              auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 flex items-start gap-4 hover:bg-zinc-50/50 transition-colors"
                >
                  <div
                    className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                      log.type === "security"
                        ? "bg-rose-100 text-rose-600"
                        : log.type === "permission"
                          ? "bg-amber-100 text-amber-600"
                          : log.type === "login"
                            ? "bg-lime-100 text-lime-600"
                            : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {log.type === "security" ? (
                      <ShieldIcon className="h-4 w-4" />
                    ) : log.type === "permission" ? (
                      <KeyIcon className="h-4 w-4" />
                    ) : log.type === "login" ? (
                      <UnlockIcon className="h-4 w-4" />
                    ) : (
                      <Edit2Icon className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900">
                      {log.action}{" "}
                      <span className="text-zinc-500 font-normal">bởi</span> {log.actor}
                    </p>
                    <p className="text-sm text-zinc-600 mt-0.5">{log.description}</p>
                    <p className="text-xs text-zinc-400 mt-1.5 tabular-nums">{log.timestamp}</p>
                  </div>
                  {log.target && (
                    <div className="hidden sm:block text-right">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-zinc-100 text-zinc-600">
                        Target: {log.target}
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ContentCard>
      </div>

      {/* User Create/Edit Modal */}
      {showUserModal && (
        <UserFormModal
          user={editingUser}
          onClose={() => {
            setShowUserModal(false);
            setEditingUser(null);
          }}
          onSaved={handleUserSaved}
          showToast={showToast}
        />
      )}

      {/* Password Change Modal */}
      {showPasswordModal && passwordTargetUser && (
        <PasswordModal
          user={passwordTargetUser}
          onClose={() => {
            setShowPasswordModal(false);
            setPasswordTargetUser(null);
          }}
          onChanged={handlePasswordChanged}
          showToast={showToast}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deleteTargetUser && (
        <DeleteConfirmModal
          user={deleteTargetUser}
          onClose={() => {
            setShowDeleteModal(false);
            setDeleteTargetUser(null);
          }}
          onConfirm={handleDelete}
          isLoading={actionLoadingId === deleteTargetUser.id}
        />
      )}

      {/* Profile View Modal */}
      {showProfileModal && profileUser && (
        <ProfileModal
          user={profileUser}
          onClose={() => {
            setShowProfileModal(false);
            setProfileUser(null);
          }}
        />
      )}
    </Page>
  );
}

// ─── User Create / Edit Modal ─────────────────────────────────────────────────

function UserFormModal({
  user,
  onClose,
  onSaved,
  showToast,
}: {
  user: UserListItem | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (type: "success" | "error", msg: string) => void;
}) {
  const isEdit = user !== null;

  const [username, setUsername] = useState(isEdit ? user.username : "");
  const [displayName, setDisplayName] = useState(isEdit ? user.display_name : "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState(isEdit ? mapRoleKey(user.role) : "staff");
  const [selectedDomains, setSelectedDomains] = useState<string[]>(
    isEdit ? user.domains : []
  );
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isEdit || !user) {
      setSelectedPerms(new Set());
      return;
    }
    // Load existing effective permissions for the user.
    const run = async () => {
      try {
        const token = localStorage.getItem('vcpmc.token');
        if (!token) return;
        const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const body = await res.json();
          const perms = (body?.permissions || []) as string[];
          setSelectedPerms(new Set(perms));
        }
      } catch {
        // ignore
      }
    };
    run();
  }, [isEdit, user]);

  useEffect(() => {
    let alive = true;
    getPermissionMatrix()
      .then((m) => { if (alive) setMatrix(m); })
      .catch(() => { /* matrix is optional */ });
    return () => { alive = false; };
  }, []);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!isEdit && (!password || password.length < 6)) {
      errs.password = "Mật khẩu phải có ít nhất 6 ký tự";
    }
    if (!isEdit && password !== confirmPassword) {
      errs.confirmPassword = "Mật khẩu xác nhận không khớp";
    }
    if (!displayName.trim()) {
      errs.displayName = "Họ tên không được để trống";
    }
    if (!isEdit && !username.trim()) {
      errs.username = "Username không được để trống";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const roleValue = mapRoleValue(role);
      // Domain ids: convert selectedDomains (string[]) to number[] using matrix.
      let domainIdsForApi: number[] = [];
      if (selectedDomains.length > 0 && matrix) {
        // selectedDomains holds the domain codes (e.g. 'KARAOKE'). Map to ids.
        domainIdsForApi = matrix.available_domains
          .filter((d) => selectedDomains.includes(d.code))
          .map((d) => d.id);
      }
      const payload = {
        display_name: displayName.trim(),
        role: roleValue,
        ...(password ? { password } : {}),
      };
      if (isEdit) {
        await updateUser(user.id, payload);
        // Persist the permission matrix (backend resolves allow/deny via
        // user_permission overrides against role defaults).
        if (matrix) {
          await updateUserRolePermissions(user.id, {
            role: roleValue,
            permissions: Array.from(selectedPerms),
            domain_ids: domainIdsForApi,
          });
        }
        showToast("success", `Đã cập nhật người dùng ${user.username}`);
      } else {
        // Creation flow: create first, then attach permissions.
        const created = await createUser({
          username: username.trim(),
          password,
          display_name: displayName.trim(),
          role: roleValue,
          domain_ids: domainIdsForApi,
        });
        if (matrix && created?.id) {
          await updateUserRolePermissions(created.id, {
            role: roleValue,
            permissions: Array.from(selectedPerms),
            domain_ids: domainIdsForApi,
          });
        }
        showToast("success", `Đã tạo người dùng ${username}`);
      }
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Thao tác thất bại";
      showToast("error", msg);
    } finally {
      setSaving(false);
    }
  };

  const togglePerm = (perm: string) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  };

  const applyListOnlyPreset = () => {
    if (!matrix) return;
    const next = new Set<string>();
    next.add('portal.access');
    next.add('contracts.list');
    // Explicitly deny detailed/contract-mutating permissions by removing them.
    [
      'contracts.read',
      'contracts.create',
      'contracts.update',
      'contracts.delete',
      'reports.export',
    ].forEach((p) => next.delete(p));
    setSelectedPerms(next);
  };

  const applyRoleDefaults = () => {
    if (!matrix) return;
    const defaults = matrix.role_defaults[roleValue] || [];
    setSelectedPerms(new Set(defaults));
  };

  const contractPermKeys = new Set([
    'contracts.list',
    'contracts.read',
    'contracts.create',
    'contracts.update',
    'contracts.delete',
  ]);
  const contractPerms = matrix
    ? matrix.available_permissions.filter((p) => contractPermKeys.has(p))
    : [];
  const otherPerms = matrix
    ? matrix.available_permissions.filter((p) => !contractPermKeys.has(p))
    : [];

  const initial = (displayName || username || "?").charAt(0).toUpperCase();
  const pwStrength = (() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 6) s++;
    if (password.length >= 10) s++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return Math.min(s, 4);
  })();
  const pwLabel = ["Yếu", "Yếu", "Trung bình", "Khá", "Mạnh"][pwStrength];
  const pwColor = ["bg-rose-400", "bg-rose-400", "bg-amber-400", "bg-amber-500", "bg-lime-500"][pwStrength];

  const roleOptions = Object.values(ROLE_DEFS).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    permCount: r.permissions.length,
  }));

  const allDomainsSelected = selectedDomains.length === 0;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={isEdit ? `Chỉnh sửa người dùng` : "Thêm người dùng mới"}
      description={isEdit ? user.username : "Cấp tài khoản và phân quyền truy cập"}
      maxWidth="2xl"
      bleed
    >
      <form onSubmit={handleSubmit}>
        {/* Hero strip with avatar preview */}
        <div className="relative px-6 py-5 bg-gradient-to-br from-[#fcf2e3] via-[#faf3e2] to-[#f0d4a8]/60 border-b border-[#e3d2b3]/50 overflow-hidden">
          <div className="absolute inset-0 dot-grid opacity-50" />
          <div className="relative flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#c89968] to-[#9c6d3e] text-white text-2xl font-bold flex items-center justify-center ring-4 ring-white/70 shadow-[0_8px_20px_-8px_rgba(156,109,62,0.5)]">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#2d2419] truncate">
                {displayName || (isEdit ? user.display_name : "Người dùng mới")}
              </p>
              <p className="text-xs text-[#6b756f] truncate">
                {username ? `@${username}` : "Chưa có username"}
                {" · "}
                {roleOptions.find((r) => r.id === role)?.name}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* LEFT: Identity & credentials (3 cols) */}
            <div className="lg:col-span-3 space-y-5">
              <section>
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9c6d3e] mb-3 flex items-center gap-1.5">
                  <span className="h-px w-4 bg-[#c89968]/60" />
                  Thông tin định danh
                </h4>
                <div className="space-y-4">
                  {!isEdit && (
                    <Input
                      label="Username"
                      placeholder="vd: nguyenvana"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
                      required
                      maxLength={50}
                      error={errors.username}
                      hint="Chỉ chữ thường, số, dấu gạch. Không thể đổi sau khi tạo."
                    />
                  )}
                  <Input
                    label="Họ và tên"
                    placeholder="vd: Nguyễn Văn A"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    maxLength={100}
                    error={errors.displayName}
                  />
                </div>
              </section>

              {!isEdit && (
                <section>
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9c6d3e] mb-3 flex items-center gap-1.5">
                    <span className="h-px w-4 bg-[#c89968]/60" />
                    Mật khẩu
                  </h4>
                  <div className="space-y-3">
                    <Input
                      label="Mật khẩu"
                      type="password"
                      placeholder="Tối thiểu 6 ký tự"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      maxLength={128}
                      error={errors.password}
                    />
                    {password && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 grid grid-cols-4 gap-1">
                          {[0, 1, 2, 3].map((i) => (
                            <span
                              key={i}
                              className={`h-1.5 rounded-full transition-colors ${
                                i < pwStrength ? pwColor : "bg-zinc-200"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[11px] font-medium text-[#6b756f] w-16 text-right">
                          {pwLabel}
                        </span>
                      </div>
                    )}
                    <Input
                      label="Xác nhận mật khẩu"
                      type="password"
                      placeholder="Nhập lại mật khẩu"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      maxLength={128}
                      error={errors.confirmPassword}
                    />
                  </div>
                </section>
              )}

              <section>
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9c6d3e] mb-3 flex items-center gap-1.5">
                  <span className="h-px w-4 bg-[#c89968]/60" />
                  Vai trò
                </h4>
                <div className="space-y-2">
                  {roleOptions.map((r) => {
                    const active = role === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setRole(r.id)}
                        className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                          active
                            ? "border-[#c89968] bg-gradient-to-br from-[#fcf2e3] to-[#faf3e2] shadow-[0_0_0_3px_rgba(200,153,104,0.12)]"
                            : "border-[#e3d2b3]/60 bg-white hover:border-[#c89968]/60 hover:bg-[#faf8f3]"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`flex-shrink-0 mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                              active ? "border-[#9c6d3e] bg-[#9c6d3e]" : "border-zinc-300"
                            }`}
                          >
                            {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-sm font-semibold ${active ? "text-[#5a4533]" : "text-[#2d2419]"}`}>
                                {r.name}
                              </p>
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                active ? "bg-[#c89968]/20 text-[#5a4533]" : "bg-zinc-100 text-zinc-500"
                              }`}>
                                {r.permCount} quyền
                              </span>
                            </div>
                            <p className="text-xs text-[#6b756f] mt-0.5">{r.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* RIGHT: Domains (2 cols) */}
            <div className="lg:col-span-2">
              <section className="sticky top-0">
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9c6d3e] mb-3 flex items-center gap-1.5">
                  <span className="h-px w-4 bg-[#c89968]/60" />
                  Phạm vi nghiệp vụ
                </h4>
                <p className="text-xs text-[#6b756f] mb-3">
                  Domain mà người dùng được phép truy cập.
                </p>

                <button
                  type="button"
                  onClick={() => setSelectedDomains([])}
                  className={`w-full mb-2 p-3 rounded-xl border transition-all ${
                    allDomainsSelected
                      ? "border-[#c89968] bg-gradient-to-br from-[#fcf2e3] to-[#f0d4a8]/40"
                      : "border-[#e3d2b3]/60 bg-white hover:border-[#c89968]/60"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ShieldIcon className={`h-4 w-4 ${allDomainsSelected ? "text-[#9c6d3e]" : "text-zinc-400"}`} />
                    <span className={`text-sm font-semibold ${allDomainsSelected ? "text-[#5a4533]" : "text-[#2d2419]"}`}>
                      Tất cả domain
                    </span>
                  </div>
                </button>

                <div className="max-h-72 overflow-y-auto scrollbar-thin rounded-xl border border-[#e3d2b3]/60 bg-[#faf8f3]/60 p-2 space-y-1">
                  {DOMAINS.filter((d) => !d.adminOnly).map((d) => {
                    const checked = selectedDomains.includes(d.id);
                    return (
                      <label
                        key={d.id}
                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                          checked ? "bg-white ring-1 ring-[#c89968]/40" : "hover:bg-white/70"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDomains((prev) => [...prev, d.id]);
                            } else {
                              setSelectedDomains((prev) => prev.filter((x) => x !== d.id));
                            }
                          }}
                          className="h-4 w-4 rounded border-[#c89968]/40 text-[#9c6d3e] focus:ring-[#c89968]/40"
                        />
                        <span className="text-sm text-[#2d2419] flex-1">{d.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-[#9aa39d]">
                  Đã chọn <span className="font-semibold text-[#5a4533]">{allDomainsSelected ? "Tất cả" : selectedDomains.length}</span>
                </p>
              </section>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[#e3d2b3]/40 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} type="button" disabled={saving}>
              Hủy
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? (
                <>
                  <LoaderIcon className="h-4 w-4 animate-spin" />
                  Đang lưu...
                </>
              ) : isEdit ? (
                "Lưu thay đổi"
              ) : (
                "Tạo người dùng"
              )}
            </Button>
          </div>
        </div>
      </form>

      {matrix && (
        <PermissionMatrixSection
          matrix={matrix}
          selectedPerms={selectedPerms}
          onTogglePerm={togglePerm}
          onApplyListOnlyPreset={applyListOnlyPreset}
          onApplyRoleDefaults={applyRoleDefaults}
          contractPerms={contractPerms}
          otherPerms={otherPerms}
        />
      )}
    </Modal>
  );
}

function PermissionMatrixSection({
  matrix,
  selectedPerms,
  onTogglePerm,
  onApplyListOnlyPreset,
  onApplyRoleDefaults,
  contractPerms,
  otherPerms,
}: {
  matrix: PermissionMatrix;
  selectedPerms: Set<string>;
  onTogglePerm: (perm: string) => void;
  onApplyListOnlyPreset: () => void;
  onApplyRoleDefaults: () => void;
  contractPerms: string[];
  otherPerms: string[];
}) {
  return (
    <div className="px-6 py-5 border-t border-[#e3d2b3]/40 bg-[#faf8f3]/60">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9c6d3e] mb-3 flex items-center gap-1.5">
        <span className="h-px w-4 bg-[#c89968]/60" />
        Phân quyền chức năng
      </h4>
      <p className="text-xs text-[#6b756f] mb-3">
        Ma trận này dựng từ <code>PERMISSIONS</code> thật của backend. Ma trận có
        hiệu lực bằng role mặc định + các quyền được cấp thêm - các quyền bị
        thu hồi.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={onApplyRoleDefaults}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white ring-1 ring-[#c89968]/40 hover:ring-[#9c6d3e] hover:bg-[#fcf2e3] transition-colors"
        >
          Dùng mặc định theo role
        </button>
        <button
          type="button"
          onClick={onApplyListOnlyPreset}
          data-testid="list-only-preset"
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white ring-1 ring-emerald-300 hover:ring-emerald-500 hover:bg-emerald-50 transition-colors flex items-center gap-1.5"
        >
          <CalculatorIcon className="h-3.5 w-3.5 text-emerald-700" />
          Chỉ xem danh sách hợp đồng
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e3d2b3]/60 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#faf8f3] text-[10.5px] uppercase tracking-wider text-[#6b6661]">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Quyền</th>
              <th className="text-left px-3 py-2 font-semibold">Mô tả</th>
              <th className="text-center px-3 py-2 font-semibold w-20">Cấp</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={3} className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-[#9c6d3e] bg-[#fcf2e3]/40">
                Hợp đồng
              </td>
            </tr>
            {contractPerms.map((p) => (
              <tr key={p} className="border-t border-[#e3d2b3]/30">
                <td className="px-3 py-2 font-mono text-[12px] text-[#2d2419]">{p}</td>
                <td className="px-3 py-2 text-[#5a4533]">
                  {matrix.permission_labels[p] || p}
                </td>
                <td className="px-3 py-2 text-center">
                  <Checkbox
                    checked={selectedPerms.has(p)}
                    onChange={() => onTogglePerm(p)}
                    ariaLabel={`Cấp quyền ${p}`}
                  />
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-[#9c6d3e] bg-[#fcf2e3]/40">
                Khác
              </td>
            </tr>
            {otherPerms.map((p) => (
              <tr key={p} className="border-t border-[#e3d2b3]/30">
                <td className="px-3 py-2 font-mono text-[12px] text-[#2d2419]">{p}</td>
                <td className="px-3 py-2 text-[#5a4533]">
                  {matrix.permission_labels[p] || p}
                </td>
                <td className="px-3 py-2 text-center">
                  <Checkbox
                    checked={selectedPerms.has(p)}
                    onChange={() => onTogglePerm(p)}
                    ariaLabel={`Cấp quyền ${p}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Password Change Modal ────────────────────────────────────────────────────

function PasswordModal({
  user,
  onClose,
  onChanged,
  showToast,
}: {
  user: UserListItem;
  onClose: () => void;
  onChanged: () => void;
  showToast: (type: "success" | "error", msg: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }
    if (password !== confirm) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }
    setSaving(true);
    try {
      await changeUserPassword(user.id, password);
      onChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Đổi mật khẩu thất bại";
      showToast("error", msg);
      setSaving(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={`Đổi mật khẩu: ${user.username}`} maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <div className="p-6 space-y-4">
          <p className="text-sm text-zinc-600">
            Nhập mật khẩu mới cho tài khoản <strong>{user.username}</strong>.
          </p>
          <Input
            label="Mật khẩu mới"
            type="password"
            placeholder="Ít nhất 6 ký tự"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            required
          />
          <Input
            label="Xác nhận mật khẩu mới"
            type="password"
            placeholder="Nhập lại mật khẩu"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError("");
            }}
            required
            error={error}
          />
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} type="button" disabled={saving}>
            Hủy
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? (
              <>
                <LoaderIcon className="h-4 w-4 animate-spin" />
                Đang lưu...
              </>
            ) : (
              "Đổi mật khẩu"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────

function DeleteConfirmModal({
  user,
  onClose,
  onConfirm,
  isLoading,
}: {
  user: UserListItem;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}) {
  return (
    <Modal open={true} onClose={onClose} title="Xác nhận xóa người dùng" maxWidth="sm">
      <div className="p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="h-10 w-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangleIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-zinc-900">Xóa người dùng?</p>
            <p className="text-sm text-zinc-600 mt-1">
              Bạn có chắc chắn muốn xóa tài khoản{" "}
              <strong>{user.username}</strong>? Hành động này không thể hoàn tác.
            </p>
          </div>
        </div>
      </div>
      <div className="px-6 pb-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose} disabled={isLoading}>
          Hủy
        </Button>
        <Button variant="primary" tone="danger" onClick={onConfirm} disabled={isLoading}>
          {isLoading ? (
            <>
              <LoaderIcon className="h-4 w-4 animate-spin" />
              Đang xóa...
            </>
          ) : (
            "Xóa người dùng"
          )}
        </Button>
      </div>
    </Modal>
  );
}

// ─── Profile View Modal ───────────────────────────────────────────────────────

function ProfileModal({ user, onClose }: { user: UserListItem; onClose: () => void }) {
  const initial = (user.display_name || user.username).charAt(0).toUpperCase();
  const roleLabel = mapRoleLabel(user.role);
  const roleKey = mapRoleKey(user.role);
  const roleTone =
    roleKey === "super_admin"
      ? { bg: "bg-[#9c6d3e]", soft: "bg-[#fcf2e3]", text: "text-[#5a4533]", ring: "ring-[#c89968]/40" }
      : roleKey === "manager"
        ? { bg: "bg-[#c89968]", soft: "bg-[#faf3e2]", text: "text-[#7a5a36]", ring: "ring-[#e3d2b3]/60" }
        : { bg: "bg-[#5a4533]", soft: "bg-[#f1ede4]", text: "text-[#3d3025]", ring: "ring-[#d8cfc0]/60" };

  return (
    <Modal open={true} onClose={onClose} title="Hồ sơ người dùng" maxWidth="lg" bleed>
      <div className="relative">
        {/* Hero cover */}
        <div className="relative h-32 overflow-hidden rounded-t-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-[#fcf2e3] via-[#f0d4a8] to-[#e8c4a0]" />
          <div className="absolute inset-0 dot-grid opacity-60" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#9c6d3e]/40 to-transparent" />
          <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-white/40 blur-2xl" />
        </div>

        <div className="px-6 pb-6 -mt-12">
          {/* Avatar + identity */}
          <div className="flex items-end gap-4">
            <div className="relative">
              <div className={`h-24 w-24 rounded-2xl ${roleTone.bg} text-white text-3xl font-bold flex items-center justify-center ring-4 ring-white shadow-[0_8px_24px_-8px_rgba(156,109,62,0.45)]`}>
                {initial}
              </div>
              <span
                className={`absolute -bottom-1 -right-1 h-5 w-5 rounded-full ring-2 ring-white ${
                  user.is_active ? "bg-lime-500" : "bg-rose-500"
                }`}
                aria-label={user.is_active ? "Đang hoạt động" : "Tạm khóa"}
              />
            </div>
            <div className="flex-1 pb-1 min-w-0">
              <h3 className="text-xl font-bold text-[#2d2419] truncate">
                {user.display_name || user.username}
              </h3>
              <p className="text-sm text-[#6b756f] truncate">{user.email || `${user.username}@vcpmc.org`}</p>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${roleTone.soft} ${roleTone.text} ring-1 ${roleTone.ring}`}>
                  <ShieldIcon className="h-3.5 w-3.5" />
                  {roleLabel}
                </span>
                <StatusBadge tone={user.is_active ? "success" : "danger"} dot>
                  {user.is_active ? "Hoạt động" : "Tạm khóa"}
                </StatusBadge>
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: "ID tài khoản", value: `#${user.id}`, mono: true },
              { label: "Đăng nhập cuối", value: formatDate(user.last_seen_at), mono: false },
              { label: "Số domains", value: user.domains.includes("__all__") ? "Toàn bộ" : `${user.domains.length}`, mono: false },
            ].map((s, i) => (
              <div
                key={i}
                className="group relative rounded-xl bg-white ring-1 ring-[#e3d2b3]/50 p-3 transition-all duration-300 hover:ring-[#c89968]/60 hover:shadow-[0_0_0_3px_rgba(200,153,104,0.08),0_6px_18px_-6px_rgba(156,109,62,0.18)]"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9aa39d]">
                  {s.label}
                </p>
                <p className={`mt-1 text-sm font-semibold text-[#2d2419] ${s.mono ? "font-mono" : ""}`}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {/* Detail sections */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-[#faf8f3] ring-1 ring-[#e3d2b3]/40 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#9c6d3e] mb-3 flex items-center gap-1.5">
                <KeyIcon className="h-3.5 w-3.5" />
                Tài khoản
              </h4>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-[#6b756f]">Username</dt>
                  <dd className="font-mono text-[#2d2419]">{user.username}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#6b756f]">Vai trò</dt>
                  <dd className="font-medium text-[#2d2419]">{roleLabel}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#6b756f]">Trạng thái</dt>
                  <dd className={`font-medium ${user.is_active ? "text-lime-700" : "text-rose-700"}`}>
                    {user.is_active ? "Hoạt động" : "Tạm khóa"}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl bg-[#faf8f3] ring-1 ring-[#e3d2b3]/40 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#9c6d3e] mb-3 flex items-center gap-1.5">
                <ShieldIcon className="h-3.5 w-3.5" />
                Phạm vi nghiệp vụ
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {user.domains.length === 0 ? (
                  <span className="text-sm text-[#9aa39d] italic">Không có domain</span>
                ) : user.domains.includes("__all__") ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#5a4533] bg-gradient-to-r from-[#fcf2e3] to-[#f0d4a8] px-2.5 py-1 rounded-full ring-1 ring-[#c89968]/40">
                    <ShieldIcon className="h-3 w-3" />
                    Tất cả domain
                  </span>
                ) : (
                  user.domains.map((d) => {
                    const def = DOMAINS.find((x) => x.id === d);
                    return (
                      <span
                        key={d}
                        className="text-xs font-medium text-[#3d3025] bg-white px-2 py-1 rounded-md ring-1 ring-[#e3d2b3]/60"
                      >
                        {def?.label || d}
                      </span>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#e3d2b3]/40 bg-[#faf8f3]/50 flex justify-end gap-2 rounded-b-2xl">
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </Modal>
  );
}
