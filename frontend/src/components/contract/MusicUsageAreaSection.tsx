/**
 * MusicUsageAreaSection - Bảng Khu vực sử dụng âm nhạc
 * 
 * Component dùng chung cho toàn bộ lĩnh vực Background:
 * - Karaoke, Cafe, Nha hang, Khach san, etc.
 * - Không hard-code Karaoke/Khu vui choi
 * 
 * Design: Word/Excel print-ready, administrative form style
 */

import React from 'react';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { Button } from '../app-ui/Button';
import {
  DOMAIN_SUGGESTION_TEMPLATES,
  type DomainSuggestionTemplate,
} from '../../data/createContractOptions';
import type { BackgroundDomainCode } from '../../lib/contractCreateTypes';

export type MusicUsageArea = {
  id: string;
  /** Tên loại hình/khu vực tiêu chuẩn (vd: Karaoke chính, Khu phụ trợ). Có thể chọn từ gợi ý hoặc tự nhập. */
  areaName: string;
  /** Tên riêng hiển thị trên Bảng tính tiền bản quyền — instance-level, không sửa tên danh mục chuẩn */
  pricingLabel?: string;
  scaleDescription: string;
  musicUsageType: string;
};

export type MusicUsageAreaSectionProps = {
  /** List of music usage areas - controlled component */
  value: MusicUsageArea[];
  /** Callback when areas change - always provide new array (immutable) */
  onChange: (areas: MusicUsageArea[]) => void;
  /** Domain-specific music usage type options */
  musicUsageTypeOptions?: { value: string; label: string }[];
  /** Scale description label (varies by domain) */
  scaleLabel?: string;
  /** Domain code for suggestion templates */
  domainCode?: string;
  /** Read-only mode */
  readOnly?: boolean;
};

/** Default music usage type options */
const DEFAULT_MUSIC_USAGE_OPTIONS = [
  { value: 'Sử dụng nhạc qua đầu Karaoke', label: 'Sử dụng nhạc qua đầu Karaoke' },
  { value: 'Phát nhạc nền', label: 'Phát nhạc nền' },
  { value: 'Biểu diễn âm nhạc trực tiếp', label: 'Biểu diễn âm nhạc trực tiếp' },
  { value: 'Phát nhạc qua thiết bị nghe nhìn', label: 'Phát nhạc qua thiết bị nghe nhìn' },
  { value: 'Kết hợp (nhiều hình thức)', label: 'Kết hợp (nhiều hình thức)' },
];

function generateId(): string {
  return `area-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function MusicUsageAreaSection({
  value,
  onChange,
  musicUsageTypeOptions = DEFAULT_MUSIC_USAGE_OPTIONS,
  scaleLabel = 'Quy mô, sức chứa',
  domainCode,
  readOnly = false,
}: MusicUsageAreaSectionProps) {
  // Safe array handling - always ensure value is an array
  const rows: MusicUsageArea[] = Array.isArray(value) ? value : [];

  // Track which rows have been manually customized for pricingLabel.
  // Khi user sửa pricingLabel thủ công, id sẽ được thêm vào set để KHÔNG bị auto-sync ghi đè.
  // Nếu user xóa trống pricingLabel, id sẽ bị xóa khỏi set để lại sync theo areaName.
  const [userOverriddenIds, setUserOverriddenIds] = React.useState<Set<string>>(new Set());

  const templates = domainCode && DOMAIN_SUGGESTION_TEMPLATES[domainCode]
    ? DOMAIN_SUGGESTION_TEMPLATES[domainCode]
    : [];
  const hasTemplates = templates.length > 0;

  /** Add new row - immutable update */
  const handleAdd = () => {
    const newArea: MusicUsageArea = {
      id: generateId(),
      areaName: '',
      pricingLabel: '',
      scaleDescription: '',
      musicUsageType: musicUsageTypeOptions[0]?.value || '',
    };
    // IMMUTABLE: create new array, never mutate existing
    onChange([...rows, newArea]);
  };

  /** Delete row - immutable update */
  const handleDelete = (id: string) => {
    // Also drop override marker if present
    if (userOverriddenIds.has(id)) {
      const next = new Set(userOverriddenIds);
      next.delete(id);
      setUserOverriddenIds(next);
    }
    // IMMUTABLE: create new array filtering out the deleted row
    onChange(rows.filter((a) => a.id !== id));
  };

  /** Update field - immutable update. Nếu là areaName, sync pricingLabel nếu user chưa override. */
  const handleUpdate = (id: string, field: keyof MusicUsageArea, fieldValue: string) => {
    onChange(
      rows.map((a) => {
        if (a.id !== id) return a;
        const next: MusicUsageArea = { ...a, [field]: fieldValue };

        // When areaName changes, propagate to pricingLabel ONLY if user hasn't manually overridden it
        // AND current pricingLabel is empty (matches previous areaName).
        if (field === 'areaName') {
          const isOverridden = userOverriddenIds.has(id);
          const pricingLabelEmpty = !(a.pricingLabel && a.pricingLabel.trim().length > 0);
          if (!isOverridden && pricingLabelEmpty) {
            next.pricingLabel = fieldValue;
          }
        }
        return next;
      })
    );
  };

  /** Handle pricingLabel change specifically. Track user-override state. */
  const handlePricingLabelChange = (id: string, value: string) => {
    setUserOverriddenIds((prev) => {
      const next = new Set(prev);
      if (value.trim().length > 0) {
        // User đã nhập tay → đánh dấu override để không bị sync ghi đè
        next.add(id);
      } else {
        // User xóa trống → bỏ override để lần sau areaName đổi sẽ tự sync
        next.delete(id);
      }
      return next;
    });
    // Update giá trị như các field khác
    onChange(
      rows.map((a) => (a.id === id ? { ...a, pricingLabel: value } : a))
    );
  };

  /** Apply suggestion template */
  const handleApplyTemplate = () => {
    const newAreas: MusicUsageArea[] = templates.map((t: DomainSuggestionTemplate) => ({
      id: generateId(),
      areaName: t.areaName,
      pricingLabel: t.areaName,
      scaleDescription: t.scaleDescription,
      musicUsageType: t.musicUsageType,
    }));
    // IMMUTABLE: create new array with template rows appended
    onChange([...rows, ...newAreas]);
  };

  return (
    <div className="music-usage-area-section">
      {/* Header with Add button + Template suggestion */}
      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
          Khu vực sử dụng âm nhạc
        </h4>
        {!readOnly && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {hasTemplates && (
              <button
                onClick={handleApplyTemplate}
                className="text-xs text-lime-600 hover:text-lime-800 underline underline-offset-2"
                type="button"
              >
                Dùng mẫu gợi ý
              </button>
            )}
            <Button
              variant="primary"
              size="sm"
              leftIcon={<PlusIcon className="h-4 w-4" />}
              onClick={handleAdd}
              className="bg-lime-600 hover:bg-lime-700 text-white"
              type="button"
            >
              + Thêm khu vực
            </Button>
          </div>
        )}
      </div>

      {/* Word-like table */}
      <div className="-mx-1 overflow-x-auto px-1">
      <table className="music-usage-table">
        <colgroup>
          <col style={{ width: '24%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '28%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Vị trí/khu vực thực tế sử dụng âm nhạc</th>
            <th>{scaleLabel}</th>
            <th>Hình thức sử dụng âm nhạc</th>
            <th>Tên hiển thị trên bảng tính</th>
          </tr>
        </thead>
        <tbody>
          {/* Empty state - always show a row when no data */}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="text-center py-8">
                <div className="flex flex-col items-center gap-2">
                  <p className="text-sm text-zinc-500 italic">
                    Chưa có khu vực sử dụng âm nhạc nào.
                  </p>
                  <p className="text-xs text-zinc-400">
                    Nhấn{" "}
                    <span className="font-medium text-lime-600">"+ Thêm khu vực"</span>{" "}
                    để bắt đầu.
                  </p>
                </div>
              </td>
            </tr>
          ) : (
            rows.map((area) => (
              <tr key={area.id}>
                {/* Column 1: Area name */}
                <td>
                  {readOnly ? (
                    <span className="px-2 py-1">{area.areaName || '—'}</span>
                  ) : (
                    <input
                      type="text"
                      value={area.areaName}
                      onChange={(e) => handleUpdate(area.id, 'areaName', e.target.value)}
                      placeholder="VD: Tầng 1, Khu VIP, Phòng 201..."
                      className="table-input"
                    />
                  )}
                </td>
                {/* Column 2: Scale description */}
                <td>
                  {readOnly ? (
                    <span className="px-2 py-1">{area.scaleDescription || '—'}</span>
                  ) : (
                    <input
                      type="text"
                      value={area.scaleDescription}
                      onChange={(e) => handleUpdate(area.id, 'scaleDescription', e.target.value)}
                      placeholder="VD: 10 phòng, 80 chỗ, 120m²..."
                      className="table-input"
                    />
                  )}
                </td>
                {/* Column 3: Music usage type + Delete */}
                <td>
                  <div className="flex items-center gap-2">
                    {readOnly ? (
                      <span className="px-2 py-1">{area.musicUsageType || '—'}</span>
                    ) : (
                      <input
                        type="text"
                        value={area.musicUsageType}
                        onChange={(e) => handleUpdate(area.id, 'musicUsageType', e.target.value)}
                        placeholder="VD: Sử dụng nhạc qua đầu Karaoke..."
                        className="table-input"
                      />
                    )}
                    {!readOnly && (
                      <button
                        onClick={() => handleDelete(area.id)}
                        className="text-zinc-400 hover:text-rose-500 transition-colors p-1 rounded flex-shrink-0"
                        title="Xóa khu vực"
                        type="button"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
                {/* Column 4: Pricing label - tên riêng hiển thị trên Bảng tính tiền bản quyền.
                   Auto-sync theo areaName khi user chưa override. */}
                <td>
                  {readOnly ? (
                    <span className="px-2 py-1">{area.pricingLabel || area.areaName || '—'}</span>
                  ) : (
                    <div>
                      <input
                        type="text"
                        value={area.pricingLabel ?? ''}
                        onChange={(e) => handlePricingLabelChange(area.id, e.target.value)}
                        placeholder="Tự lấy theo vị trí nếu để trống"
                        title="Chỉ dùng để in bảng tính/Word, không ảnh hưởng công thức"
                        className="table-input"
                      />
                      {!area.pricingLabel?.trim() && !area.areaName.trim() ? null : (
                        <p className="text-[10.5px] text-zinc-400 mt-1 leading-tight">
                          {area.pricingLabel && area.pricingLabel.trim().length > 0
                            ? userOverriddenIds.has(area.id)
                              ? 'Đặt tên riêng cho bảng tính — không ảnh hưởng công thức.'
                              : null
                            : 'Chỉ dùng để in bảng tính/Word, không ảnh hưởng công thức.'}
                        </p>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>

      {/* Row count */}
      {rows.length > 0 && (
        <p className="text-xs text-zinc-500 mt-2">
          Tổng cộng: {rows.length} khu vực
        </p>
      )}

      <style>{`
        .music-usage-table {
          width: 100%;
          min-width: 560px;
          border-collapse: collapse;
          table-layout: fixed;
          font-family: "Times New Roman", Times, serif;
          font-size: 14px;
          color: #000;
          background: #fff;
          border: 1px solid #C9DDAE;
        }

        .music-usage-table th,
        .music-usage-table td {
          border: 1px solid #C9DDAE;
          padding: 6px 8px;
          vertical-align: middle;
        }

        .music-usage-table th {
          background: #4A7202;
          color: #FFFFFF;
          font-weight: 700;
          text-align: center;
        }

        .music-usage-table td {
          background: #fff;
        }

        .table-input {
          width: 100%;
          border: none;
          background: transparent;
          font-family: inherit;
          font-size: inherit;
          color: #000;
          outline: none;
          padding: 2px 4px;
        }

        .table-input:focus {
          background: #f0f9ff;
        }

        .table-input::placeholder {
          color: #999;
          font-style: italic;
        }

        @media print {
          .music-usage-table {
            font-size: 12px;
          }

          .music-usage-table th,
          .music-usage-table td {
            padding: 4px 6px;
          }

          .table-input {
            background: transparent;
          }

          button {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Preview-only read-only table for display purposes
 */
export function MusicUsageAreaTablePreview({
  value,
  scaleLabel = 'Quy mô, sức chứa',
}: {
  value: MusicUsageArea[];
  scaleLabel?: string;
}) {
  const rows: MusicUsageArea[] = Array.isArray(value) ? value : [];
  
  return (
    <table className="music-usage-table">
      <colgroup>
        <col style={{ width: '30%' }} />
        <col style={{ width: '35%' }} />
        <col style={{ width: '35%' }} />
      </colgroup>
        <thead>
          <tr>
            <th>Vị trí/khu vực thực tế sử dụng âm nhạc</th>
            <th>{scaleLabel}</th>
            <th>Hình thức sử dụng âm nhạc</th>
          </tr>
        </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={3} className="text-center py-4 text-zinc-500">
              (Không có thông tin khu vực sử dụng âm nhạc)
            </td>
          </tr>
        ) : (
          rows.map((area) => (
            <tr key={area.id}>
              <td>{area.areaName || '—'}</td>
              <td>{area.scaleDescription || '—'}</td>
              <td>{area.musicUsageType || '—'}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
