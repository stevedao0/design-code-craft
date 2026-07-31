/**
 * Hộp thoại "Xuất báo cáo hợp đồng".
 *
 * Cho phép chọn kỳ báo cáo (năm / quý / tháng / tuần / khoảng ngày) và phạm vi
 * (toàn bộ hoặc theo lĩnh vực), sau đó dựng file Excel theo template VCPMC.
 * Toàn bộ số liệu lấy từ API báo cáo — frontend không tính lại tiền.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/app-ui/Dialog';
import { Button } from '@/components/app-ui/Button';
import { Select } from '@/components/app-ui/Select';
import { Input } from '@/components/app-ui/Input';
import { getContracts } from './kpiClient';
import { getFieldDomains } from '@/lib/kpiFieldClient';
import { generateContractListWorkbook, contractListWorkbookFilename } from '@/lib/reports/generateContractListWorkbook';
import type { ContractReportPayload } from '@/lib/reports/generateContractListWorkbook';
import type { ContractListItem } from './types';
import { toast } from '@/lib/toast';

type PeriodMode = 'year' | 'quarter' | 'month' | 'week' | 'custom';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Thứ 2 của tuần ISO thứ `week` trong năm. */
function isoWeekStart(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dayIdx = (jan4.getDay() + 6) % 7;
  const week1Mon = new Date(year, 0, 4 - dayIdx);
  return new Date(week1Mon.getFullYear(), week1Mon.getMonth(), week1Mon.getDate() + (week - 1) * 7);
}

function currentIsoWeek(d = new Date()): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const fDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fDay + 3);
  return 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  year: number;
  ownerEmail?: string;
  canViewMoney?: boolean;
  /** Nhãn phạm vi mặc định hiển thị trên file, ví dụ "Toàn đơn vị". */
  scopeLabel?: string;
}

export function ContractExportDialog({
  open, onOpenChange, year, ownerEmail, canViewMoney = true, scopeLabel = 'Toàn đơn vị',
}: Props) {
  const [mode, setMode] = useState<PeriodMode>('year');
  const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [week, setWeek] = useState(currentIsoWeek());
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [field, setField] = useState('');
  const [onlyValued, setOnlyValued] = useState(false);
  const [fieldOptions, setFieldOptions] = useState([{ value: '', label: 'Tất cả lĩnh vực' }]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFrom(`${year}-01-01`);
    setTo(`${year}-12-31`);
  }, [year]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getFieldDomains()
      .then(r => {
        if (cancelled) return;
        setFieldOptions([{ value: '', label: 'Tất cả lĩnh vực' }, ...r.domains.map(d => ({ value: d.code, label: d.label }))]);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [open]);

  const range = useMemo<{ from: Date; to: Date; label: string }>(() => {
    if (mode === 'quarter') {
      const s = new Date(year, (quarter - 1) * 3, 1);
      const e = new Date(year, quarter * 3, 0);
      return { from: s, to: e, label: `Quý ${quarter}/${year}` };
    }
    if (mode === 'month') {
      const s = new Date(year, month - 1, 1);
      const e = new Date(year, month, 0);
      return { from: s, to: e, label: `Tháng ${month}/${year}` };
    }
    if (mode === 'week') {
      const s = isoWeekStart(year, week);
      const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
      return { from: s, to: e, label: `Tuần ${week}/${year}` };
    }
    if (mode === 'custom') {
      const s = new Date(from);
      const e = new Date(to);
      return { from: s, to: e, label: `${s.toLocaleDateString('vi-VN')} – ${e.toLocaleDateString('vi-VN')}` };
    }
    return { from: new Date(year, 0, 1), to: new Date(year, 11, 31), label: `Năm ${year}` };
  }, [mode, year, quarter, month, week, from, to]);

  const periodLabel = `${range.label} (${range.from.toLocaleDateString('vi-VN')} – ${range.to.toLocaleDateString('vi-VN')})`;

  const handleExport = async () => {
    setBusy(true);
    try {
      // Lấy toàn bộ danh sách của năm (API phân trang) rồi lọc theo kỳ đã chọn.
      const first = await getContracts({
        year, page: 1, page_size: 200,
        field: field || undefined,
        owner_email: ownerEmail || undefined,
        sort_by: 'signed_date', sort_order: 'asc',
      });
      let items: ContractListItem[] = [...first.items];
      for (let p = 2; p <= first.total_pages; p++) {
        const next = await getContracts({
          year, page: p, page_size: 200,
          field: field || undefined,
          owner_email: ownerEmail || undefined,
          sort_by: 'signed_date', sort_order: 'asc',
        });
        items = items.concat(next.items);
      }

      const fromIso = iso(range.from);
      const toIso = iso(range.to);
      let scoped = items.filter(it => {
        if (!it.signed_date) return mode === 'year';
        const d = it.signed_date.slice(0, 10);
        return d >= fromIso && d <= toIso;
      });
      if (onlyValued) {
        scoped = scoped.filter(it => (it.total_payment ?? it.royalty_amount_before_vat) != null);
      }

      if (scoped.length === 0) {
        toast.error('Không có hợp đồng nào trong kỳ đã chọn');
        return;
      }

      // Phân rã theo lĩnh vực — cộng từ chính dữ liệu backend đã trả về.
      const byField = new Map<string, { count: number; actual: number }>();
      scoped.forEach(it => {
        const key = it.field || 'Chưa xác định';
        const cur = byField.get(key) ?? { count: 0, actual: 0 };
        cur.count += 1;
        cur.actual += it.total_payment ?? it.royalty_amount_before_vat ?? 0;
        byField.set(key, cur);
      });

      const payload: ContractReportPayload = {
        title: 'Báo cáo danh sách hợp đồng đã ký',
        periodLabel,
        scopeLabel: field
          ? `${scopeLabel} · Lĩnh vực: ${fieldOptions.find(o => o.value === field)?.label ?? field}`
          : scopeLabel,
        ownerLabel: ownerEmail,
        year,
        items: scoped,
        includeValues: canViewMoney,
        fields: Array.from(byField.entries()).map(([label, v]) => ({
          label, target: null, actual: v.actual, contractCount: v.count,
        })),
      };

      const blob = await generateContractListWorkbook(payload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = contractListWorkbookFilename(payload);
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Đã xuất ${scoped.length} hợp đồng`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi xuất báo cáo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Xuất báo cáo hợp đồng</DialogTitle>
          <DialogDescription>
            Chọn kỳ báo cáo và phạm vi. File Excel gồm 4 sheet: Tổng hợp, Danh sách hợp đồng, Phân loại & tái ký và Chưa có doanh thu.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <label className="text-[11.5px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Kỳ báo cáo
            </label>
            <Select
              value={mode}
              onChange={v => setMode(v as PeriodMode)}
              options={[
                { value: 'year', label: `Cả năm ${year}` },
                { value: 'quarter', label: 'Theo quý' },
                { value: 'month', label: 'Theo tháng' },
                { value: 'week', label: 'Theo tuần' },
                { value: 'custom', label: 'Khoảng ngày tuỳ chọn' },
              ]}
            />
          </div>

          {mode === 'quarter' && (
            <Select
              value={String(quarter)}
              onChange={v => setQuarter(Number(v))}
              options={[1, 2, 3, 4].map(q => ({ value: String(q), label: `Quý ${q}/${year}` }))}
            />
          )}
          {mode === 'month' && (
            <Select
              value={String(month)}
              onChange={v => setMonth(Number(v))}
              options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Tháng ${i + 1}/${year}` }))}
            />
          )}
          {mode === 'week' && (
            <Select
              value={String(week)}
              onChange={v => setWeek(Number(v))}
              options={Array.from({ length: 53 }, (_, i) => ({ value: String(i + 1), label: `Tuần ${i + 1}/${year}` }))}
            />
          )}
          {mode === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          )}

          <div className="grid gap-1.5">
            <label className="text-[11.5px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Lĩnh vực
            </label>
            <Select value={field} onChange={setField} options={fieldOptions} />
          </div>

          <label className="flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={onlyValued}
              onChange={e => setOnlyValued(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#4A7202]"
            />
            Chỉ xuất hợp đồng đã có doanh thu (bỏ bản soạn sẵn)
          </label>

          <div
            className="rounded-lg border px-3 py-2 text-[12px]"
            style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-muted, #f6faf1)', color: 'var(--text-secondary)' }}
          >
            Kỳ đã chọn: <strong>{periodLabel}</strong>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Đóng</Button>
          <Button variant="primary" onClick={handleExport} disabled={busy}>
            {busy ? 'Đang xuất…' : 'Xuất Excel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
