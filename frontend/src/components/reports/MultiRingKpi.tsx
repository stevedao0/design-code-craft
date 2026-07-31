/**
 * Multi-ring concentric KPI visualization.
 *
 * - One ring per business field (independent KPIs).
 * - Rings are concentric, each smaller than the last.
 * - Each ring has a distinct color.
 * - Hover/focus: highlights the ring and shows target/actual/contract in the center.
 * - Click: selects the field.
 * - Center: field count (idle) or hovered field full breakdown.
 */
import React, { useState } from 'react';

interface FieldData {
  field_code: string;
  field_label: string;
  target: number;
  actual: number;
  progress_percent: number;
  contract_count: number;
  has_target: boolean;
  is_active: boolean;
}

interface MultiRingKpiProps {
  fields: FieldData[];
  selectedField: string | null;
  onFieldSelect: (code: string) => void;
  size?: number;
}

const RING_COLORS = [
  '#4A7202',
  '#76B400',
  '#2da88f',
  '#4a7fc1',
  '#8b6db3',
  '#d99425',
  '#c95867',
  '#6d365b',
];

function getRingColor(index: number): string {
  return RING_COLORS[index % RING_COLORS.length];
}

function fmtCompact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} tỷ`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} tr`;
  return n.toLocaleString('vi-VN');
}

function fmtFull(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('vi-VN');
}

export function MultiRingKpi(props: MultiRingKpiProps) {
  const { fields, selectedField, onFieldSelect, size = 200 } = props;
  const [hoveredField, setHoveredField] = useState<string | null>(null);

  if (fields.length === 0) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          border: '2px dashed #e6e0d7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#999' }}>—</div>
          <div style={{ fontSize: 9, color: '#999' }}>Chưa có KPI</div>
        </div>
      </div>
    );
  }

  const strokeWidth = 14;
  const ringGap = 4;
  const n = fields.length;
  const baseRadius = (size / 2) - strokeWidth / 2;
  const ringRadii: number[] = [];
  for (let i = 0; i < n; i++) {
    ringRadii.push(baseRadius - i * (strokeWidth + ringGap));
  }

  const hoveredData = hoveredField ? fields.find(f => f.field_code === hoveredField) : null;
  const centerLabel = hoveredData ? hoveredData.field_label : null;
  const valueGap = hoveredData && hoveredData.target > 0
    ? hoveredData.actual - hoveredData.target
    : 0;
  const isExceeded = hoveredData ? hoveredData.actual >= hoveredData.target && hoveredData.target > 0 : false;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        {fields.map((f, i) => {
          const r = ringRadii[i];
          const circumference = 2 * Math.PI * r;
          const hasTarget = f.has_target && f.target > 0;
          const visualPct = hasTarget ? Math.min(f.progress_percent, 100) : 0;
          const dash = (visualPct / 100) * circumference;
          const color = getRingColor(i);
          const isDimmed = !hasTarget;
          const isHovered = hoveredField === f.field_code;
          const isSelected = selectedField === f.field_code;
          const cx = size / 2;
          const cy = size / 2;
          const finalOpacity = isDimmed ? 0.5 : (isHovered || isSelected ? 1 : 0.8);
          const finalStroke = isDimmed ? '#e6e0d7' : color;

          return (
            <g key={f.field_code}>
              <circle
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke="#e6e0d7"
                strokeWidth={strokeWidth}
              />
              {visualPct > 0 && (
                <circle
                  cx={cx} cy={cy} r={r}
                  fill="none"
                  stroke={finalStroke}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circumference}`}
                  opacity={finalOpacity}
                  style={{ transition: 'opacity 0.15s' }}
                  onClick={() => onFieldSelect(f.field_code)}
                  onMouseEnter={() => setHoveredField(f.field_code)}
                  onMouseLeave={() => setHoveredField(null)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onFieldSelect(f.field_code);
                    }
                  }}
                  aria-label={`${f.field_label}: ${
                    hasTarget
                      ? `${f.progress_percent.toFixed(1)}% (${f.actual.toLocaleString('vi-VN')} / ${f.target.toLocaleString('vi-VN')}, ${f.contract_count} HĐ)`
                      : 'Chưa thiết lập'
                  }`}
                />
              )}
            </g>
          );
        })}
      </svg>

      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4,
      }}>
        {centerLabel && hoveredData ? (
          <div style={{ textAlign: 'center', lineHeight: 1.25, maxWidth: size - 16 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#2c2c2c',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {centerLabel}
            </div>
            <div style={{
              fontSize: 18,
              fontWeight: 800,
              color: isExceeded ? '#4A7202' : '#2c2c2c',
              fontVariantNumeric: 'tabular-nums',
              marginTop: 2,
            }}>
              {hoveredData.has_target && hoveredData.target > 0
                ? `${hoveredData.progress_percent.toFixed(1)}%`
                : '—'}
            </div>
            <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>
              MT {fmtCompact(hoveredData.target)} · Đạt {fmtCompact(hoveredData.actual)}
            </div>
            <div style={{ fontSize: 9, color: isExceeded ? '#4A7202' : '#a04a00', marginTop: 1 }}>
              {hoveredData.has_target && hoveredData.target > 0
                ? (isExceeded ? `Vượt ${fmtCompact(valueGap)}` : `Thiếu ${fmtCompact(-valueGap)}`)
                : 'Chưa giao KPI'}
            </div>
            <div style={{ fontSize: 9, color: '#888', marginTop: 1 }}>
              {fmtFull(hoveredData.contract_count || 0)} HĐ
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#2c2c2c', lineHeight: 1 }}>
              {fields.length}
            </div>
            <div style={{ fontSize: 9, color: '#999', marginTop: 2 }}>
              lĩnh vực KPI
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
