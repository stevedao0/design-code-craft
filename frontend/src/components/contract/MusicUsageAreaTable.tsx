/**
 * MusicUsageAreaTable - Word-like table for music usage areas
 * 
 * Reusable component for all Background domains:
 * - Karaoke, Cafe, Restaurant, Hotel, etc.
 * 
 * Design: Word/Excel print-ready, administrative form style
 * - HTML <table> with border-collapse
 * - Gray header background
 * - Clear borders
 * - Fixed layout
 */

import React, { useState } from 'react';
import { PlusIcon, TrashIcon } from 'lucide-react';

export type MusicUsageArea = {
  id: string;
  areaName: string;
  scaleDescription: string;
  musicUsageType: string;
};

export type MusicUsageAreaTableProps = {
  /** List of music usage areas */
  areas: MusicUsageArea[];
  /** Callback when areas change */
  onChange: (areas: MusicUsageArea[]) => void;
  /** Whether to show edit controls */
  editable?: boolean;
  /** Domain-specific music usage type options */
  musicUsageTypeOptions?: { value: string; label: string }[];
  /** Scale description label (varies by domain) */
  scaleLabel?: string;
  /** Subject label for the table (e.g., "Khu vực sử dụng âm nhạc") */
  subjectLabel?: string;
};

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

export function MusicUsageAreaTable({
  areas,
  onChange,
  editable = true,
  musicUsageTypeOptions = DEFAULT_MUSIC_USAGE_OPTIONS,
  scaleLabel = 'Quy mô, sức chứa',
  subjectLabel = 'Khu vực sử dụng âm nhạc',
}: MusicUsageAreaTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAddRow = () => {
    const newArea: MusicUsageArea = {
      id: generateId(),
      areaName: '',
      scaleDescription: '',
      musicUsageType: musicUsageTypeOptions[0]?.value || '',
    };
    onChange([...areas, newArea]);
    setEditingId(newArea.id);
  };

  const handleDeleteRow = (id: string) => {
    onChange(areas.filter((a) => a.id !== id));
  };

  const handleUpdateField = (id: string, field: keyof MusicUsageArea, value: string) => {
    onChange(
      areas.map((a) =>
        a.id === id ? { ...a, [field]: value } : a
      )
    );
  };

  const isEmpty = areas.length === 0 || areas.every(
    (a) => !a.areaName && !a.scaleDescription && !a.musicUsageType
  );

  return (
    <div className="space-y-3">
      {/* Table */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          fontFamily: '"Times New Roman", Times, serif',
          fontSize: '14px',
          lineHeight: '1.25',
          color: '#000',
          background: '#fff',
        }}
      >
        <colgroup>
          <col style={{ width: '35%' }} />
          <col style={{ width: '35%' }} />
          <col style={{ width: '30%' }} />
        </colgroup>

        <thead>
          <tr>
            <th
              style={{
                border: '1px solid #000',
                padding: '6px 8px',
                background: '#d9d9d9',
                fontWeight: 700,
                textAlign: 'center',
                verticalAlign: 'middle',
              }}
            >
              Vị trí / khu vực sử dụng âm nhạc
            </th>
            <th
              style={{
                border: '1px solid #000',
                padding: '6px 8px',
                background: '#d9d9d9',
                fontWeight: 700,
                textAlign: 'center',
                verticalAlign: 'middle',
              }}
            >
              {scaleLabel}
            </th>
            <th
              style={{
                border: '1px solid #000',
                padding: '6px 8px',
                background: '#d9d9d9',
                fontWeight: 700,
                textAlign: 'center',
                verticalAlign: 'middle',
              }}
            >
              Hình thức sử dụng âm nhạc
            </th>
          </tr>
        </thead>

        <tbody>
          {areas.length === 0 ? (
            <tr>
              <td
                colSpan={3}
                style={{
                  border: '1px solid #000',
                  padding: '20px',
                  textAlign: 'center',
                  color: '#666',
                }}
              >
                Chưa có khu vực sử dụng âm nhạc
              </td>
            </tr>
          ) : (
            areas.map((area) => (
              <tr key={area.id}>
                {/* Area Name */}
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '4px 6px',
                    verticalAlign: 'middle',
                  }}
                >
                  {editable || editingId === area.id ? (
                    <input
                      type="text"
                      value={area.areaName}
                      onChange={(e) => handleUpdateField(area.id, 'areaName', e.target.value)}
                      placeholder="VD: Phòng Karaoke VIP, Khu vực chính..."
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        fontFamily: 'inherit',
                        fontSize: 'inherit',
                        padding: '2px 4px',
                        background: editingId === area.id ? '#fffde7' : 'transparent',
                      }}
                      onFocus={() => setEditingId(area.id)}
                      onBlur={() => setEditingId(null)}
                    />
                  ) : (
                    <span style={{ padding: '2px 4px' }}>{area.areaName || '—'}</span>
                  )}
                </td>

                {/* Scale Description */}
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '4px 6px',
                    verticalAlign: 'middle',
                  }}
                >
                  {editable || editingId === area.id ? (
                    <input
                      type="text"
                      value={area.scaleDescription}
                      onChange={(e) => handleUpdateField(area.id, 'scaleDescription', e.target.value)}
                      placeholder="VD: 10 phòng, 80 chỗ, 120 m²..."
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        fontFamily: 'inherit',
                        fontSize: 'inherit',
                        padding: '2px 4px',
                        background: editingId === area.id ? '#fffde7' : 'transparent',
                      }}
                      onFocus={() => setEditingId(area.id)}
                      onBlur={() => setEditingId(null)}
                    />
                  ) : (
                    <span style={{ padding: '2px 4px' }}>{area.scaleDescription || '—'}</span>
                  )}
                </td>

                {/* Music Usage Type */}
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '4px 6px',
                    verticalAlign: 'middle',
                  }}
                >
                  {editable ? (
                    <select
                      value={area.musicUsageType}
                      onChange={(e) => handleUpdateField(area.id, 'musicUsageType', e.target.value)}
                      style={{
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        fontFamily: 'inherit',
                        fontSize: 'inherit',
                        padding: '2px 4px',
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="">-- Chọn --</option>
                      {musicUsageTypeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ padding: '2px 4px' }}>{area.musicUsageType || '—'}</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Edit controls */}
      {editable && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddRow}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 12px',
              fontSize: '13px',
              color: '#1d4ed8',
              background: 'transparent',
              border: '1px solid #1d4ed8',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            <PlusIcon style={{ width: '14px', height: '14px' }} />
            Thêm dòng
          </button>
          {areas.length > 0 && (
            <span style={{ fontSize: '12px', color: '#666' }}>
              {areas.length} dòng
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Simple preview-only version for read-only display
 */
export function MusicUsageAreaTablePreview({
  areas,
  scaleLabel = 'Quy mô, sức chứa',
}: {
  areas: MusicUsageArea[];
  scaleLabel?: string;
}) {
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        fontFamily: '"Times New Roman", Times, serif',
        fontSize: '14px',
        lineHeight: '1.25',
        color: '#000',
        background: '#fff',
      }}
    >
      <colgroup>
        <col style={{ width: '35%' }} />
        <col style={{ width: '35%' }} />
        <col style={{ width: '30%' }} />
      </colgroup>

      <thead>
        <tr>
          <th
            style={{
              border: '1px solid #000',
              padding: '6px 8px',
              background: '#d9d9d9',
              fontWeight: 700,
              textAlign: 'center',
              verticalAlign: 'middle',
            }}
          >
            Vị trí / khu vực sử dụng âm nhạc
          </th>
          <th
            style={{
              border: '1px solid #000',
              padding: '6px 8px',
              background: '#d9d9d9',
              fontWeight: 700,
              textAlign: 'center',
              verticalAlign: 'middle',
            }}
          >
            {scaleLabel}
          </th>
          <th
            style={{
              border: '1px solid #000',
              padding: '6px 8px',
              background: '#d9d9d9',
              fontWeight: 700,
              textAlign: 'center',
              verticalAlign: 'middle',
            }}
          >
            Hình thức sử dụng âm nhạc
          </th>
        </tr>
      </thead>

      <tbody>
        {areas.length === 0 ? (
          <tr>
            <td
              colSpan={3}
              style={{
                border: '1px solid #000',
                padding: '20px',
                textAlign: 'center',
                color: '#666',
              }}
            >
              (Không có thông tin khu vực sử dụng âm nhạc)
            </td>
          </tr>
        ) : (
          areas.map((area) => (
            <tr key={area.id}>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '6px 8px',
                  verticalAlign: 'middle',
                }}
              >
                {area.areaName || '—'}
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '6px 8px',
                  verticalAlign: 'middle',
                }}
              >
                {area.scaleDescription || '—'}
              </td>
              <td
                style={{
                  border: '1px solid #000',
                  padding: '6px 8px',
                  verticalAlign: 'middle',
                }}
              >
                {area.musicUsageType || '—'}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
