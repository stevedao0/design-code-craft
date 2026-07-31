import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  UsersIcon,
  SaveIcon,
  RotateCcwIcon,
  AlertCircleIcon,
  LoaderIcon,
  ShieldCheckIcon,
  ChevronRightIcon,
  UserCheckIcon,
  UserXIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { Page, PageHeader } from "../components/app-ui/Page";
import { ContentCard } from "../components/app-ui/ContentCard";
import { Button } from "../components/app-ui/Button";
import { Checkbox } from "../components/app-ui/Checkbox";
import { StatusBadge } from "../components/app-ui/StatusBadge";
import { Modal } from "../components/app-ui/Modal";
import {
  getAdminUsers,
  getPermissionMatrix,
  updateUserRolePermissions,
  AdminUser,
  PermissionMatrix,
  RolePermissionsPayload,
} from "../lib/adminClient";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  mod: "Manager",
  user: "Staff",
};

const PERMISSION_GROUPS = [
  {
    key: "portal",
    label: "Portal",
    permissions: [{ key: "portal.access", label: "Truy cập Portal" }],
  },
  {
    key: "contracts",
    label: "Hợp đồng",
    permissions: [
      { key: "contracts.read", label: "Xem hợp đồng" },
      { key: "contracts.create", label: "Tạo hợp đồng" },
      { key: "contracts.update", label: "Cập nhật hợp đồng" },
      { key: "contracts.delete", label: "Xóa hợp đồng" },
    ],
  },
  {
    key: "annexes",
    label: "Phụ lục",
    permissions: [
      { key: "annexes.read", label: "Xem phụ lục" },
      { key: "annexes.create", label: "Tạo phụ lục" },
      { key: "annexes.update", label: "Cập nhật phụ lục" },
      { key: "annexes.delete", label: "Xóa phụ lục" },
    ],
  },
  {
    key: "catalogue",
    label: "Danh mục",
    permissions: [{ key: "catalogue.upload", label: "Upload danh mục" }],
  },
  {
    key: "works",
    label: "Tác phẩm",
    permissions: [
      { key: "works.read", label: "Xem tác phẩm" },
      { key: "works.import", label: "Import tác phẩm" },
    ],
  },
  {
    key: "reports",
    label: "Báo cáo",
    permissions: [
      { key: "reports.view", label: "Xem báo cáo" },
      { key: "reports.export", label: "Xuất báo cáo" },
    ],
  },
  {
    key: "admin",
    label: "Admin",
    permissions: [
      { key: "admin.users.manage", label: "Quản lý người dùng" },
      { key: "admin.system.manage", label: "Quản lý hệ thống" },
      { key: "admin.ops.view", label: "Xem vận hành" },
      { key: "admin.data.manage", label: "Quản lý dữ liệu" },
    ],
  },
];

const DANGEROUS_PERMISSIONS = new Set([
  "contracts.delete",
  "admin.system.manage",
  "admin.data.manage",
]);

function Toast({
  type,
  message,
  onClose,
}: {
  type: "success" | "error" | "warning";
  message: string;
  onClose: () => void;
}) {
  const bg =
    type === "success"
      ? "bg-lime-600"
      : type === "error"
        ? "bg-rose-600"
        : "bg-amber-600";
  return (
    <div
      className={`fixed bottom-6 right-6 ${bg} text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-[fadein_0.2s_ease-out] z-50 min-w-[300px]`}
    >
      {type === "success" && <CheckCircleIcon className="h-5 w-5 shrink-0" />}
      {type === "error" && <AlertCircleIcon className="h-5 w-5 shrink-0" />}
      {type === "warning" && <AlertTriangleIcon className="h-5 w-5 shrink-0" />}
      <span className="text-sm font-medium flex-1">{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-70 transition-opacity">
        &times;
      </button>
    </div>
  );
}

export function PermissionsPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [localRole, setLocalRole] = useState("");
  const [localPerms, setLocalPerms] = useState<string[]>([]);
  const [localDomainIds, setLocalDomainIds] = useState<number[]>([]);
  const [serverPerms, setServerPerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(
    null
  );
  const [showDangerModal, setShowDangerModal] = useState(false);
  const [pendingDangerousPerms, setPendingDangerousPerms] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToastMsg = useCallback(
    (type: "success" | "error" | "warning", message: string) => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast({ type, message });
      toastTimer.current = setTimeout(() => setToast(null), 4000);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [usersData, matrixData] = await Promise.all([
          getAdminUsers(),
          getPermissionMatrix(),
        ]);
        setUsers(usersData);
        setMatrix(matrixData);
        if (usersData.length > 0) {
          selectUser(usersData[0], usersData, matrixData);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Tải dữ liệu thất bại";
        setLoadError(msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const selectUser = (user: AdminUser, userList?: AdminUser[], matrixData?: PermissionMatrix) => {
    setSelectedUser(user);
    setLocalRole(user.role);
    setLocalPerms(Array.isArray(user.permissions) ? [...user.permissions] : []);
    setServerPerms(Array.isArray(user.permissions) ? [...user.permissions] : []);
    const domainCodes = new Set(user.domains);
    const ids =
      (matrixData || matrix)?.available_domains
        .filter((d) => domainCodes.has(d.code))
        .map((d) => d.id) ||
      (matrixData || matrix)?.available_domains
        .filter((d) => domainCodes.has(d.code.toLowerCase()))
        .map((d) => d.id) ||
      [];
    setLocalDomainIds(ids);
  };

  const isDirty =
    selectedUser !== null &&
    (localRole !== selectedUser.role ||
      JSON.stringify([...localPerms].sort()) !==
        JSON.stringify([...serverPerms].sort()) ||
      JSON.stringify([...localDomainIds].sort()) !==
        JSON.stringify(
          [...selectedUser.domains]
            .map((c) => matrix?.available_domains.find((d) => d.code === c)?.id)
            .filter(Boolean) as number[]
        ));

  const handleRoleChange = (newRole: string) => {
    setLocalRole(newRole);
    const defaults = matrix?.role_defaults?.[newRole];
    if (Array.isArray(defaults)) {
      setLocalPerms([...defaults]);
    }
  };

  const handleToggle = (permKey: string) => {
    setLocalPerms((prev) => {
      if (prev.includes(permKey)) return prev.filter((p) => p !== permKey);
      return [...prev, permKey];
    });
  };

  const handleDomainToggle = (domainId: number) => {
    setLocalDomainIds((prev) => {
      if (prev.includes(domainId)) return prev.filter((id) => id !== domainId);
      return [...prev, domainId];
    });
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    const dangerous = new Set(
      localPerms.filter((p) => DANGEROUS_PERMISSIONS.has(p))
    );
    if (dangerous.size > 0) {
      setPendingDangerousPerms(dangerous);
      setShowDangerModal(true);
      return;
    }
    await doSave();
  };

  const doSave = async () => {
    if (!selectedUser) return;
    setShowDangerModal(false);
    setSaving(true);
    setSaveError(null);
    try {
      const result = await updateUserRolePermissions(selectedUser.id, {
        role: localRole,
        permissions: localPerms,
        domain_ids: localDomainIds,
      });
      setServerPerms([...localPerms]);
      const updated = { ...selectedUser, role: result.updated_role, permissions: localPerms };
      setSelectedUser(updated);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      if (result.warnings.length > 0) {
        showToastMsg("warning", `Đã lưu. ${result.warnings.join(" ")}`);
      } else {
        showToastMsg("success", "Đã cập nhật quyền thành công");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lưu thất bại";
      setSaveError(msg);
      showToastMsg("error", msg);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!selectedUser) return;
    selectUser(selectedUser);
  };

  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      (u.display_name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q)
    );
  });

  return (
    <Page>
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      <PageHeader
        breadcrumb="/admin/permissions"
        title="Phân quyền"
        description="Kiểm soát truy cập theo module, hành động và phạm vi domain cho từng người dùng."
        actions={
          <>
            {isDirty && (
              <span className="text-sm font-medium text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg mr-2 animate-pulse">
                Chưa lưu thay đổi
              </span>
            )}
            <Button
              variant="ghost"
              leftIcon={<RotateCcwIcon className="h-4 w-4" />}
              onClick={handleReset}
              disabled={!isDirty || saving}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              leftIcon={
                saving ? (
                  <LoaderIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <SaveIcon className="h-4 w-4" />
                )
              }
              onClick={handleSave}
              disabled={!isDirty || saving || !selectedUser}
            >
              {saving ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </>
        }
      />

      {loading ? (
        <ContentCard padded>
          <div className="flex items-center justify-center py-16 gap-3 text-zinc-500">
            <LoaderIcon className="h-5 w-5 animate-spin" />
            <span className="text-sm">Đang tải dữ liệu...</span>
          </div>
        </ContentCard>
      ) : loadError ? (
        <ContentCard padded>
          <div className="flex flex-col items-center py-16 gap-3 text-rose-600">
            <AlertCircleIcon className="h-8 w-8" />
            <p className="text-sm font-medium">{loadError}</p>
          </div>
        </ContentCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* User List */}
          <div className="lg:col-span-1 space-y-3">
            <div className="relative">
              <UsersIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Tìm người dùng..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 focus:border-amber-600 transition-all"
              />
            </div>
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden divide-y divide-zinc-100">
              {filteredUsers.length === 0 ? (
                <div className="p-4 text-center text-sm text-zinc-400">Không tìm thấy</div>
              ) : (
                filteredUsers.map((u) => {
                  const isSelected = selectedUser?.id === u.id;
                  return (
                    <button
                      key={u.id}
                      onClick={() => selectUser(u, users, matrix ?? undefined)}
                      className={`w-full text-left p-3 transition-all flex items-center gap-3 hover:bg-zinc-50 ${
                        isSelected
                          ? "bg-amber-50 border-l-2 border-amber-600"
                          : "border-l-2 border-transparent"
                      }`}
                    >
                      <div
                        className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isSelected
                            ? "bg-amber-200 text-amber-800"
                            : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {(u.display_name || u.username).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isSelected ? "text-amber-950" : "text-zinc-900"}`}>
                          {u.display_name || u.username}
                        </p>
                        <p className="text-xs text-zinc-500 truncate">{ROLE_LABELS[u.role] || u.role}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {u.is_active ? (
                          <UserCheckIcon className="h-3.5 w-3.5 text-lime-500" />
                        ) : (
                          <UserXIcon className="h-3.5 w-3.5 text-rose-400" />
                        )}
                        <ChevronRightIcon className="h-3.5 w-3.5 text-zinc-300" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Editor Panel */}
          <div className="lg:col-span-3">
            {!selectedUser ? (
              <ContentCard padded>
                <div className="flex flex-col items-center py-16 gap-3 text-zinc-400">
                  <UsersIcon className="h-10 w-10 opacity-40" />
                  <p className="text-sm">Chọn một người dùng để chỉnh sửa</p>
                </div>
              </ContentCard>
            ) : (
              <div className="space-y-6">
                {/* User Summary */}
                <ContentCard padded accent>
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-amber-100 text-amber-800 text-xl font-bold flex items-center justify-center">
                      {(selectedUser.display_name || selectedUser.username).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-zinc-900">
                        {selectedUser.display_name || selectedUser.username}
                      </h3>
                      <p className="text-sm text-zinc-500">{selectedUser.email || selectedUser.username}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge tone={selectedUser.is_active ? "success" : "danger"} dot>
                        {selectedUser.is_active ? "Hoạt động" : "Tạm khóa"}
                      </StatusBadge>
                    </div>
                  </div>
                </ContentCard>

                {/* Role Selector */}
                <ContentCard
                  title="Vai trò"
                  description="Thay đổi vai trò sẽ cập nhật quyền mặc định. Quyền tùy chỉnh vẫn được giữ."
                >
                  <div className="flex flex-wrap gap-3">
                    {["admin", "mod", "user"].map((r) => (
                      <button
                        key={r}
                        onClick={() => handleRoleChange(r)}
                        className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                          localRole === r
                            ? "bg-amber-700 text-white border-amber-700 shadow-sm"
                            : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                        }`}
                      >
                        {ROLE_LABELS[r]}
                      </button>
                    ))}
                  </div>
                </ContentCard>

                {/* Domain Assignment */}
                <ContentCard
                  title="Phạm vi domain"
                  description="Chọn domain mà người dùng được phép truy cập."
                >
                  {matrix && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {matrix.available_domains.map((d) => {
                        const checked = localDomainIds.includes(d.id);
                        return (
                          <label
                            key={d.id}
                            className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                              checked
                                ? "bg-amber-50 border-amber-200"
                                : "bg-white border-zinc-200 hover:border-zinc-300"
                            }`}
                          >
                            <Checkbox
                              checked={checked}
                              onChange={() => handleDomainToggle(d.id)}
                              label={<span className="text-sm text-zinc-700">{d.name_vi}</span>}
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </ContentCard>

                {/* Permission Matrix */}
                <ContentCard
                  title="Quyền hệ thống"
                  description="Bật/tắt các quyền cụ thể cho người dùng này."
                  padded={false}
                >
                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    {PERMISSION_GROUPS.map((group) => {
                      const groupPerms = group.permissions.filter(
                        (p) => matrix && matrix.available_permissions.includes(p.key)
                      );
                      if (groupPerms.length === 0) return null;
                      const allChecked = groupPerms.every((p) => localPerms.includes(p.key));
                      const someChecked =
                        groupPerms.some((p) => localPerms.includes(p.key)) && !allChecked;

                      return (
                        <div key={group.key} className="space-y-3">
                          <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                            <h4 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider">
                              {group.label}
                            </h4>
                            <button
                              onClick={() => {
                                if (allChecked) {
                                  setLocalPerms((prev) =>
                                    prev.filter((p) => !groupPerms.find((gp) => gp.key === p))
                                  );
                                } else {
                                  setLocalPerms((prev) => {
                                    const next = new Set(prev);
                                    groupPerms.forEach((p) => next.add(p.key));
                                    return Array.from(next);
                                  });
                                }
                              }}
                              className="text-xs font-medium text-amber-700 hover:text-amber-800"
                            >
                              {allChecked ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                            </button>
                          </div>
                          <div className="space-y-2 pl-1">
                            {groupPerms.map((perm) => {
                              const isDangerous = DANGEROUS_PERMISSIONS.has(perm.key);
                              return (
                                <div
                                  key={perm.key}
                                  className="flex items-start gap-2"
                                >
                                  <Checkbox
                                    checked={localPerms.includes(perm.key)}
                                    onChange={() => handleToggle(perm.key)}
                                    label={
                                      <div className="ml-1">
                                        <span className="text-sm font-medium text-zinc-800 block">
                                          {perm.label}
                                          {isDangerous && (
                                            <span className="ml-1.5 text-rose-500 text-[10px] font-semibold uppercase">
                                              Nguy hiểm
                                            </span>
                                          )}
                                        </span>
                                        <span className="text-[10px] font-mono text-zinc-400">
                                          {perm.key}
                                        </span>
                                      </div>
                                    }
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ContentCard>

                {/* Effective Permissions Summary */}
                <ContentCard
                  title="Tóm tắt"
                  description={`${localPerms.length} quyền · ${localDomainIds.length} domain`}
                >
                  <div className="flex flex-wrap gap-2">
                    {localPerms.map((p) => {
                      const group = PERMISSION_GROUPS.find((g) =>
                        g.permissions.some((gp) => gp.key === p)
                      );
                      return (
                        <span
                          key={p}
                          className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700 ring-1 ring-inset ring-zinc-200"
                        >
                          {group?.permissions.find((gp) => gp.key === p)?.label || p}
                        </span>
                      );
                    })}
                    {localPerms.length === 0 && (
                      <span className="text-sm text-zinc-400 italic">Không có quyền nào</span>
                    )}
                  </div>
                </ContentCard>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dangerous Permission Confirmation Modal */}
      <Modal
        open={showDangerModal}
        onClose={() => setShowDangerModal(false)}
        title="Xác nhận quyền nguy hiểm"
        maxWidth="sm"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <AlertTriangleIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-zinc-900">Bạn đang gán quyền nguy hiểm</p>
              <p className="text-sm text-zinc-600 mt-1">
                Các quyền sau có thể ảnh hưởng đến dữ liệu hoặc hệ thống:
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(pendingDangerousPerms).map((p) => {
              const group = PERMISSION_GROUPS.find((g) =>
                g.permissions.some((gp) => gp.key === p)
              );
              return (
                <span
                  key={p}
                  className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
                >
                  {group?.permissions.find((gp) => gp.key === p)?.label || p}
                </span>
              );
            })}
          </div>
          <p className="text-sm text-zinc-500">
            Xác nhận tiếp tục lưu các quyền này cho{" "}
            <strong>{selectedUser?.display_name || selectedUser?.username}</strong>?
          </p>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setShowDangerModal(false)} disabled={saving}>
            Hủy
          </Button>
          <Button
            variant="primary"
            tone="danger"
            onClick={doSave}
            disabled={saving}
            leftIcon={saving ? <LoaderIcon className="h-4 w-4 animate-spin" /> : undefined}
          >
            {saving ? "Đang lưu..." : "Xác nhận"}
          </Button>
        </div>
      </Modal>
    </Page>
  );
}
