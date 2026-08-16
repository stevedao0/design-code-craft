/**
 * KPI Management Drawer.
 *
 * Right-side drawer "Quản lý KPI theo lĩnh vực".
 *
 * - Year + Email context selectors
 * - List of assigned fields as rows with edit/toggle/delete
 * - "+ Thêm lĩnh vực" button → add/edit dialog
 * - VND-formatted money input
 * - Duplicate validation surfaced as Vietnamese message
 * - Confirmation before delete
 * - Refreshes parent KPI cards via callback (no full reload)
 */
import React, { useEffect, useMemo, useState } from 'react';
import { PlusIcon, PencilIcon, Trash2Icon, PowerIcon } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/app-ui/Sheet';
import { Button } from '@/components/app-ui/Button';
import { MoneyInput } from '@/components/app-ui/MoneyInput';
import { Select } from '@/components/app-ui/Select';
import { Input } from '@/components/app-ui/Input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, AlertDialog, AlertDialogContent,
  AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/app-ui/Dialog';
import {
  getYears, getFieldUsers, getFieldDomains,
  getFieldAssignments, createFieldAssignment,
  updateFieldAssignment, deleteFieldAssignment,
  KpiFieldYearOption, KpiFieldUserOption, KpiFieldDomainOption,
  KpiFieldAssignment,
} from '@/lib/kpiFieldClient';
import { toast } from '@/lib/toast';
import { formatCurrency } from '@/lib/format';

interface KpiManagementDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialYear: number;
  initialEmail: string;
  onChange?: () => void;
}

interface FormState {
  reporting_year: number;
  user_email: string;
  field_code: string;
  target_amount: number;
  note: string;
  is_active: boolean;
}

function emptyForm(year: number, email: string): FormState {
  return {
    reporting_year: year,
    user_email: email,
    field_code: '',
    target_amount: 0,
    note: '',
    is_active: true,
  };
}

export function KpiManagementDrawer({
  open, onOpenChange, initialYear, initialEmail, onChange,
}: KpiManagementDrawerProps) {
  const [year, setYear] = useState<number>(initialYear);
  const [email, setEmail] = useState<string>(initialEmail);
  const [years, setYears] = useState<KpiFieldYearOption[]>([]);
  const [users, setUsers] = useState<KpiFieldUserOption[]>([]);
  const [domains, setDomains] = useState<KpiFieldDomainOption[]>([]);
  const [assignments, setAssignments] = useState<KpiFieldAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<KpiFieldAssignment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KpiFieldAssignment | null>(null);

  // Sync context to parent when drawer opens/changes
  useEffect(() => {
    if (open) {
      setYear(initialYear);
      setEmail(initialEmail);
    }
  }, [open, initialYear, initialEmail]);

  // Load dropdown options once
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      try {
        const [yr, us, dom] = await Promise.all([getYears(), getFieldUsers(), getFieldDomains()]);
        if (mounted) {
          setYears(yr.years);
          setUsers(us.users);
          setDomains(dom.domains);
        }
      } catch (e) {
        toast.error('Không tải được danh sách năm / người dùng / lĩnh vực.');
      }
    })();
    return () => { mounted = false; };
  }, [open]);

  // Load assignments whenever year/email changes (and drawer is open)
  const reload = async () => {
    if (!email || !year) return;
    setLoading(true);
    try {
      const r = await getFieldAssignments(year, email);
      setAssignments(r.assignments);
    } catch (e) {
      toast.error('Không tải được danh sách KPI.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (open) reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, year, email]);

  const notifyChange = () => {
    if (onChange) onChange();
  };

  // ============= ADD/EDIT form =============
  const [form, setForm] = useState<FormState>(emptyForm(initialYear, initialEmail));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>('');

  const openAdd = () => {
    setForm(emptyForm(year, email));
    setFormError('');
    setEditTarget(null);
    setAddOpen(true);
  };
  const openEdit = (a: KpiFieldAssignment) => {
    setForm({
      reporting_year: a.reporting_year,
      user_email: a.user_email,
      field_code: a.field_code,
      target_amount: a.target_amount,
      note: a.note || '',
      is_active: a.is_active,
    });
    setFormError('');
    setEditTarget(a);
    setAddOpen(true);
  };

  const submitForm = async () => {
    if (!form.field_code) { setFormError('Vui lòng chọn lĩnh vực.'); return; }
    if (!form.user_email) { setFormError('Vui lòng chọn email người quản lý.'); return; }
    if (!form.reporting_year) { setFormError('Vui lòng chọn năm.'); return; }
    if (!(form.target_amount > 0)) { setFormError('Mục tiêu KPI phải lớn hơn 0.'); return; }

    setSubmitting(true);
    setFormError('');
    try {
      if (editTarget) {
        await updateFieldAssignment(editTarget.assignment_id, {
          target_amount: form.target_amount,
          note: form.note || null,
          is_active: form.is_active,
        });
        toast.success('Đã cập nhật KPI.');
      } else {
        await createFieldAssignment({
          reporting_year: form.reporting_year,
          user_email: form.user_email,
          field_code: form.field_code,
          target_amount: form.target_amount,
          note: form.note || null,
          is_active: form.is_active,
        });
        toast.success('Đã thêm KPI.');
      }
      setAddOpen(false);
      await reload();
      notifyChange();
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (/duplicate|409|đã tồn tại/i.test(msg)) {
        setFormError('Email này đã có KPI cho lĩnh vực này trong năm đã chọn. Vui lòng chọn lĩnh vực khác.');
      } else if (/permission|403/i.test(msg)) {
        setFormError('Bạn không có quyền thực hiện thao tác này.');
      } else {
        setFormError(msg || 'Không thể lưu KPI.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ============= Toggle =============
  const toggleActive = async (a: KpiFieldAssignment) => {
    try {
      await updateFieldAssignment(a.assignment_id, { is_active: !a.is_active });
      toast.success(a.is_active ? 'Đã ngừng áp dụng.' : 'Đã kích hoạt.');
      await reload();
      notifyChange();
    } catch (e: any) {
      toast.error(e?.message || 'Không thể thay đổi trạng thái.');
    }
  };

  // ============= Delete =============
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteFieldAssignment(deleteTarget.assignment_id);
      toast.success('Đã xóa KPI.');
      setDeleteTarget(null);
      await reload();
      notifyChange();
    } catch (e: any) {
      toast.error(e?.message || 'Không thể xóa KPI.');
    }
  };

  const yearOpts = useMemo(
    () => years.slice().sort((a, b) => b.year - a.year).map(y => ({ value: String(y.year), label: y.is_current ? `${y.year} (Hiện tại)` : String(y.year) })),
    [years]
  );
  const userOpts = useMemo(
    () => users.map(u => ({ value: u.email, label: u.email })),
    [users]
  );
  const fieldOpts = useMemo(
    () => domains.map(d => ({ value: d.code, label: d.label })),
    [domains]
  );

  // Exclude fields already assigned for this year/email (for Add form, when not editing)
  const takenFields = useMemo(() => new Set(assignments.map(a => a.field_code)), [assignments]);
  const addFieldOpts = useMemo(
    () => fieldOpts.filter(o => !takenFields.has(o.value)),
    [fieldOpts, takenFields]
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} side="right">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>Quản lý KPI theo lĩnh vực</SheetTitle>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md px-2 py-1 text-xs"
              style={{ color: 'var(--text-secondary)' }}
            >
              Đóng
            </button>
          </div>
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            Mỗi lĩnh vực có KPI độc lập. Cùng một email có thể quản lý nhiều lĩnh vực trong cùng năm.
          </p>
        </SheetHeader>

        <SheetContent>
          <div className="flex-1 overflow-auto px-4 py-3">
            {/* Context selectors */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Select
                label="Năm áp dụng"
                value={String(year)}
                onChange={v => setYear(Number(v))}
                options={yearOpts}
                size="sm"
              />
              <Select
                label="Email người quản lý"
                value={email}
                onChange={setEmail}
                options={userOpts}
                size="sm"
                placeholder="— Chọn email —"
              />
            </div>

            <div className="mb-3 flex items-center justify-between">
              <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                Đang quản lý <b style={{ color: 'var(--text-primary)' }}>{assignments.length}</b> lĩnh vực
                {assignments.length > 0 && (
                  <span className="ml-1" style={{ color: 'var(--text-secondary)' }}>
                    (chỉ số liệu tham khảo, không cộng dồn KPI)
                  </span>
                )}
              </div>
              <Button size="sm" leftIcon={<PlusIcon className="h-3.5 w-3.5" />} onClick={openAdd}>
                Thêm lĩnh vực
              </Button>
            </div>

            {/* Rows */}
            <div className="space-y-2">
              {loading && (
                <div className="rounded-lg border border-dashed p-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Đang tải...
                </div>
              )}
              {!loading && assignments.length === 0 && (
                <div className="rounded-lg border border-dashed p-4 text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
                  Chưa có lĩnh vực nào được gán cho email này trong năm đã chọn.
                </div>
              )}
              {!loading && assignments.map(a => (
                <div
                  key={a.assignment_id}
                  className="rounded-lg border p-3"
                  style={{ borderColor: 'var(--border-default)', background: 'var(--surface)' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {a.field_label}
                        </div>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            background: a.is_active
                              ? 'color-mix(in srgb, var(--accent-success) 14%, white)'
                              : 'color-mix(in srgb, var(--text-secondary, #6b7280) 14%, white)',
                            color: a.is_active
                              ? 'var(--accent-success)'
                              : 'var(--text-secondary, #6b7280)',
                          }}
                        >
                          {a.is_active ? 'Đang áp dụng' : 'Ngừng áp dụng'}
                        </span>
                      </div>
                      <div className="mt-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                        Mục tiêu:&nbsp;
                        <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                          {formatCurrency(a.target_amount)}
                        </span>
                      </div>
                      {a.note && (
                        <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          Ghi chú: {a.note}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        title="Sửa"
                        onClick={() => openEdit(a)}
                        className="rounded-md p-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--accent-primary,#4A7202)_10%,white)]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title={a.is_active ? 'Ngừng áp dụng' : 'Kích hoạt'}
                        onClick={() => toggleActive(a)}
                        className="rounded-md p-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--accent-warning,#d99425)_10%,white)]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <PowerIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Xóa"
                        onClick={() => setDeleteTarget(a)}
                        className="rounded-md p-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--accent-danger,#c43c3c)_10%,white)]"
                        style={{ color: 'var(--accent-danger, #c43c3c)' }}
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Add/Edit Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Sửa KPI' : 'Thêm KPI theo lĩnh vực'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-5 py-4">
            <Select
              label="Năm áp dụng"
              value={String(form.reporting_year)}
              onChange={v => setForm({ ...form, reporting_year: Number(v) })}
              options={yearOpts}
              disabled={!!editTarget}
            />
            <Select
              label="Email người quản lý"
              value={form.user_email}
              onChange={v => setForm({ ...form, user_email: v })}
              options={userOpts}
              disabled={!!editTarget}
              placeholder="— Chọn email —"
            />
            <Select
              label="Lĩnh vực"
              value={form.field_code}
              onChange={v => setForm({ ...form, field_code: v })}
              options={editTarget ? [{ value: editTarget.field_code, label: editTarget.field_label }] : addFieldOpts}
              disabled={!!editTarget}
              placeholder={editTarget ? editTarget.field_label : '— Chọn lĩnh vực —'}
            />
            <MoneyInput
              label="Mục tiêu KPI (VND)"
              required
              value={form.target_amount}
              onChange={v => setForm({ ...form, target_amount: v })}
            />
            <Input
              label="Ghi chú (tuỳ chọn)"
              value={form.note}
              onChange={(e: any) => setForm({ ...form, note: e.target.value })}
            />
            <label className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => setForm({ ...form, is_active: e.target.checked })}
              />
              Đang áp dụng
            </label>
            {formError && (
              <div
                className="rounded-md px-3 py-2 text-[12px]"
                style={{ background: 'color-mix(in srgb, var(--accent-danger, #c43c3c) 10%, white)', color: 'var(--accent-danger, #c43c3c)' }}
              >
                {formError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Huỷ</Button>
            <Button onClick={submitForm} disabled={submitting}>
              {submitting ? 'Đang lưu...' : (editTarget ? 'Lưu thay đổi' : 'Thêm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa KPI lĩnh vực?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sắp xoá KPI <b>{deleteTarget?.field_label}</b> của <b>{deleteTarget?.user_email}</b> năm <b>{deleteTarget?.reporting_year}</b>.
              Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Huỷ</Button>
            <Button variant="danger" onClick={confirmDelete}>Xóa</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}