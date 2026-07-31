import React, { useState } from 'react';
import { Button } from '@/components/app-ui/Button';
import { Input } from '@/components/app-ui/Input';
import { Textarea } from '@/components/app-ui/Textarea';
import { Select } from '@/components/app-ui/Select';
import type { AnnualTarget } from './types';
import { putAnnualTarget } from './kpiClient';
import { Skeleton } from './Skeleton';

function _formatDisplay(num: number): string {
  if (!num) return '';
  return new Intl.NumberFormat('vi-VN').format(num);
}

interface AnnualTargetFormProps {
  initial: AnnualTarget | null;
  year: number;
  onYearChange: (y: number) => void;
  onSaved: () => void;
}

export function AnnualTargetForm({ initial, year, onYearChange, onSaved }: AnnualTargetFormProps) {
  const [target, setTarget] = useState<string>(
    initial?.annual_target != null ? _formatDisplay(initial.annual_target) : ''
  );
  const [note, setNote] = useState<string>(initial?.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_, i) => currentYear - 2 + i);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(false);
    const val = Number(target.replace(/[^\d]/g, ''));
    if (!val || val < 0) {
      setError('Giá trị KPI phải >= 0');
      return;
    }
    setSaving(true);
    try {
      await putAnnualTarget({ year, annual_target: val, note: note || undefined });
      setOk(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const handleTargetChange = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, '');
    const num = Number(digits);
    const formatted = _formatDisplay(num);
    setTarget(formatted);
  };

  const handleCancel = () => {
    setTarget(initial?.annual_target != null ? _formatDisplay(initial.annual_target) : '');
    setNote(initial?.note || '');
    setError(null);
    setOk(false);
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Năm"
          value={String(year)}
          onChange={v => onYearChange(Number(v))}
          options={years.map(y => ({ value: String(y), label: String(y) }))}
        />
        <Input
          label="Muc tieu nam"
          inputMode="numeric"
          value={target}
          onChange={e => handleTargetChange(e.target.value)}
          placeholder="VD: 5.000.000.000"
          hint={target ? `${target} VND` : undefined}
        />
      </div>
      <Textarea
        label="Ghi chú"
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={2}
        placeholder="Ghi chú KPI năm (tùy chọn)"
      />
      {error && (
        <p className="text-xs" style={{ color: 'var(--accent-primary, #4A7202)' }}>{error}</p>
      )}
      {ok && (
        <p className="text-xs" style={{ color: 'var(--accent-success, #3f8f5b)' }}>Đã lưu KPI năm.</p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={saving}
          size="sm"
        >
          {saving ? 'Đang lưu...' : 'Lưu'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          disabled={saving}
        >
          Hủy
        </Button>
      </div>
    </form>
  );
}

export function AnnualTargetFormSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
