/**
 * Hộp thoại xuất Excel "Bảng tính tiền bản quyền".
 *
 * Ngôn ngữ thiết kế "Cream & Marine" của app:
 *  - Nền kem, thẻ trắng, viền #E5E1D8, accent navy #4A7202
 *  - Cột trái: tuỳ chọn xuất  |  Cột phải: bản xem trước đúng bố cục file .xlsx
 *
 * Bản xem trước dùng chung một `ContractRoyaltyModel` với bộ sinh workbook,
 * nên những gì thấy ở đây chính là những gì nằm trong file tải về.
 */
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  XIcon, FileSpreadsheetIcon, PlusIcon, Trash2Icon, DownloadIcon,
  CheckCircle2Icon, Loader2Icon, MapPinIcon,
} from 'lucide-react';
import type {
  ContractRoyaltyModel, ContractCustomFee, BuildContractModelInput,
} from '../../lib/calculations/contractRoyaltyModel';
import {
  buildContractRoyaltyModel, defaultLegalNote, DEFAULT_LEGAL_BASIS,
} from '../../lib/calculations/contractRoyaltyModel';
import {
  generateContractRoyaltyWorkbook, contractWorkbookFilename,
} from '../../lib/calculations/generateContractRoyaltyWorkbook';
import {
  VCPMC, VCPMC_HEAD_CONTACT_LINE, VCPMC_SOUTH_CONTACT_LINE,
} from '../../lib/calculations/vcpmcIdentity';

const C = {
  cream: '#F6FAF1',
  paper: '#FFFFFF',
  subtle: '#FAF9F6',
  line: '#E5E1D8',
  lineStrong: '#E7EDE1',
  ink: '#1A1A1A',
  muted: '#6B665F',
  navy: '#4A7202',
  navySoft: '#E1EFCC',
  head: '#4A7202',
  headText: '#FFFFFF',
  band: '#F1F7E6',
  danger: '#C0392B',
};

const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
const fmtFactor = (n: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(n);

export type ContractExcelExportDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Dữ liệu tính toán hiện tại của trang (không bao gồm tuỳ chọn xuất). */
  source: Omit<BuildContractModelInput, 'customFees' | 'documentTitle' | 'legalBasis' | 'legalNote' | 'supportYear'>;
};

export function ContractExcelExportDialog({ open, onClose, source }: ContractExcelExportDialogProps) {
  const [documentTitle, setDocumentTitle] = useState('BẢNG TÍNH TIỀN BẢN QUYỀN ÂM NHẠC');
  const [legalBasis, setLegalBasis] = useState(DEFAULT_LEGAL_BASIS);
  const [legalNote, setLegalNote] = useState(defaultLegalNote(source.baseSalary));
  const [supportYear, setSupportYear] = useState(new Date().getFullYear());
  const [customFees, setCustomFees] = useState<ContractCustomFee[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const model = useMemo<ContractRoyaltyModel>(
    () => buildContractRoyaltyModel({
      ...source, customFees, documentTitle, legalBasis, legalNote, supportYear,
    }),
    [source, customFees, documentTitle, legalBasis, legalNote, supportYear],
  );

  if (!open) return null;

  const download = async () => {
    setBusy(true); setError(null);
    try {
      const blob = await generateContractRoyaltyWorkbook(model);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = contractWorkbookFilename(model);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch (e) {
      console.error('[ContractExcelExport] failed full error:', e);
      console.error('[ContractExcelExport] failed details:', {
        name: e instanceof Error ? e.name : undefined,
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
        model,
      });
      setError(
        e instanceof Error && e.message
          ? `Không tạo được file: ${e.message}`
          : 'Không tạo được file. Vui lòng thử lại.'
      );
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center p-4 sm:p-6"
      style={{ background: 'rgba(10,18,22,0.55)', backdropFilter: 'blur(3px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex w-full max-w-[1180px] max-h-[92vh] flex-col overflow-hidden rounded-lg shadow-2xl"
        style={{ background: C.cream, border: `1px solid ${C.lineStrong}` }}
      >
        {/* Header */}
        <header
          className="flex items-center justify-between gap-4 px-6 py-4"
          style={{ background: C.navy }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded bg-white/12">
              <FileSpreadsheetIcon className="h-[18px] w-[18px] text-white" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
                Xuất bảng tính Excel
              </div>
              <div className="truncate text-[10px] uppercase tracking-[0.18em] text-white/60">
                Bố cục hợp đồng · Nghị định 17/2023/NĐ-CP
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Đóng"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[330px_1fr]">
          {/* Options */}
          <aside
            className="min-h-0 overflow-y-auto p-5 space-y-5"
            style={{ background: C.paper, borderRight: `1px solid ${C.line}` }}
          >
            <Section title="Tiêu đề tài liệu">
              <Input value={documentTitle} onChange={setDocumentTitle} />
            </Section>

            <Section title="Căn cứ pháp lý">
              <Textarea value={legalBasis} onChange={setLegalBasis} rows={2} />
            </Section>

            {source.supportPct > 0 && (
              <Section title="Năm áp dụng mức hỗ trợ">
                <Input
                  value={String(supportYear)}
                  onChange={(v) => setSupportYear(Number(v.replace(/\D/g, '')) || new Date().getFullYear())}
                />
              </Section>
            )}

            <Section title="Ghi chú mức lương cơ sở">
              <Textarea value={legalNote} onChange={setLegalNote} rows={4} />
            </Section>

            <Section
              title="Chi phí khác"
              action={
                <button
                  type="button"
                  onClick={() => setCustomFees((p) => [...p, { label: '', amount: 0 }])}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider transition-opacity hover:opacity-70"
                  style={{ color: C.navy }}
                >
                  <PlusIcon className="h-3 w-3" /> Thêm
                </button>
              }
            >
              {customFees.length === 0 && (
                <p className="text-[11px] italic" style={{ color: C.muted }}>
                  Không có khoản chi phí phát sinh nào.
                </p>
              )}
              <div className="space-y-2">
                {customFees.map((fee, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={fee.label}
                      placeholder="Diễn giải"
                      onChange={(e) => setCustomFees((p) => p.map((f, j) => j === i ? { ...f, label: e.target.value } : f))}
                      className="min-w-0 flex-1 rounded border px-2 py-1.5 text-[12px] outline-none focus:border-[#4A7202]"
                      style={{ borderColor: C.line, background: C.subtle, color: C.ink }}
                    />
                    <input
                      value={fee.amount || ''}
                      placeholder="0"
                      inputMode="numeric"
                      onChange={(e) => setCustomFees((p) => p.map((f, j) => j === i ? { ...f, amount: Number(e.target.value.replace(/\D/g, '')) || 0 } : f))}
                      className="w-24 rounded border px-2 py-1.5 text-right font-mono text-[12px] tabular-nums outline-none focus:border-[#4A7202]"
                      style={{ borderColor: C.line, background: C.subtle, color: C.ink }}
                    />
                    <button
                      type="button"
                      onClick={() => setCustomFees((p) => p.filter((_, j) => j !== i))}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded transition-colors hover:bg-black/5"
                      style={{ color: C.danger }}
                      aria-label="Xoá"
                    >
                      <Trash2Icon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Địa điểm đưa vào bảng tính">
              <ul className="space-y-1.5">
                {model.blocks.map((b) => (
                  <li key={b.id} className="flex items-start gap-2 text-[11.5px]" style={{ color: C.ink }}>
                    <MapPinIcon className="mt-[2px] h-3 w-3 shrink-0" style={{ color: C.navy }} />
                    <span className="min-w-0">
                      <span className="font-semibold">{b.locationName}</span>
                      <span style={{ color: C.muted }}> · {b.fieldName} · {b.scaleText}</span>
                    </span>
                  </li>
                ))}
                {model.blocks.length === 0 && (
                  <li className="text-[11px] italic" style={{ color: C.muted }}>Chưa có dữ liệu.</li>
                )}
              </ul>
            </Section>

            <div
              className="rounded border p-3 text-[10.5px] leading-relaxed"
              style={{ borderColor: C.line, background: C.subtle, color: C.muted }}
            >
              File xuất ra dùng <b>công thức Excel</b> tham chiếu ô mức lương cơ sở và ô thuế GTGT —
              sửa hai ô này, toàn bộ bảng tự tính lại.
            </div>
          </aside>

          {/* Preview */}
          <section className="min-h-0 overflow-y-auto p-6" style={{ background: C.cream }}>
            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: C.muted }}>
              Xem trước file · {contractWorkbookFilename(model)}
            </div>
            <div
              className="mx-auto max-w-[820px] p-7 shadow-sm"
              style={{ background: C.paper, border: `1px solid ${C.line}`, fontFamily: '"Times New Roman", serif' }}
            >
              <SheetPreview model={model} />
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer
          className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
          style={{ background: C.paper, borderTop: `1px solid ${C.line}` }}
        >
          <div className="text-[12px]" style={{ color: C.muted }}>
            Tổng giá trị hợp đồng{' '}
            <span className="font-mono text-[15px] font-bold tabular-nums" style={{ color: C.navy }}>
              {vnd(model.grandTotal)} đ
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            {error && <span className="text-[11px] font-semibold" style={{ color: C.danger }}>{error}</span>}
            <button
              onClick={onClose}
              className="rounded border px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors hover:bg-black/[0.03]"
              style={{ borderColor: C.lineStrong, color: C.muted }}
            >
              Huỷ
            </button>
            <button
              onClick={download}
              disabled={busy || model.blocks.length === 0}
              className="flex items-center gap-2 rounded px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: done ? '#1E7B4D' : C.navy }}
            >
              {busy ? <Loader2Icon className="h-4 w-4 animate-spin" />
                : done ? <CheckCircle2Icon className="h-4 w-4" />
                : <DownloadIcon className="h-4 w-4" />}
              {busy ? 'Đang tạo file…' : done ? 'Đã tải xuống' : 'Tải file Excel'}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/* ── Bản xem trước bảng tính ─────────────────────────────────────────────── */

function SheetPreview({ model }: { model: ContractRoyaltyModel }) {
  const bd = `1px solid #9DBE6E`;
  const cell: React.CSSProperties = { border: bd, padding: '4px 6px', fontSize: 12.5, color: C.ink };
  const single = model.blocks.length === 1;

  return (
    <>
      <div className="mb-3 border-b pb-2 text-center" style={{ borderColor: '#4A720233' }}>
        <div className="text-[12px] font-bold uppercase" style={{ color: C.navy }}>
          {VCPMC.fullName} ({VCPMC.shortName})
        </div>
        <div className="text-[10px] leading-snug" style={{ color: C.muted }}>
          {VCPMC_HEAD_CONTACT_LINE}
        </div>
        <div className="text-[10px] leading-snug" style={{ color: C.muted }}>
          {VCPMC_SOUTH_CONTACT_LINE}
        </div>
      </div>
      <h2 className="text-center text-[17px] font-bold uppercase" style={{ color: C.navy }}>
        {model.documentTitle}
      </h2>
      <p className="mt-1 text-center text-[11px] italic" style={{ color: C.muted }}>
        Căn cứ: {model.legalBasis}
      </p>

      <table className="mt-5 w-full" style={{ borderCollapse: 'collapse' }}>
        <tbody>
          {[
            ['Đơn vị sử dụng', model.orgName || 'Chưa khai báo'],
            ['Địa chỉ', model.orgAddress || 'Chưa khai báo'],
            ['Người đại diện', model.orgRepresentative || 'Chưa khai báo'],
            ['Thời hạn hợp đồng', `${model.contractMonths} tháng`],
            ['Ngày lập bảng tính', model.quoteDate],
          ].map(([k, v]) => (
            <tr key={k}>
              <td style={{ ...cell, width: '34%', background: C.band, fontWeight: 700, color: C.navy }}>{k}</td>
              <td style={cell}>{v}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cell, background: C.band, fontWeight: 700, color: C.navy }}>Mức lương cơ sở (MLCS)</td>
            <td style={{ ...cell, fontWeight: 700, color: C.navy }}>
              {vnd(model.baseSalary)} đồng · Thuế GTGT {(model.vatPct * 100).toFixed(0)}%
            </td>
          </tr>
        </tbody>
      </table>

      {model.blocks.map((b, bi) => (
        <div key={b.id} className="mt-6">
          {!single && (
            <div style={{ background: C.navy, color: '#fff', padding: '5px 8px', fontSize: 12.5, fontWeight: 700 }}>
              {bi + 1}. {b.locationName} — {b.fieldName}
            </div>
          )}
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...cell, width: '20%', background: C.head, color: C.headText, textAlign: 'center' }}>{b.quantityHeader}</th>
                <th colSpan={4} style={{ ...cell, background: C.head, color: C.headText, textAlign: 'center' }}>
                  Mức tiền bản quyền chưa bao gồm thuế GTGT
                </th>
                <th style={{ ...cell, width: '19%', background: C.head, color: C.headText, textAlign: 'center' }}>Thành tiền (đồng)</th>
              </tr>
              <tr>
                <td colSpan={6} style={{ ...cell, textAlign: 'center', fontStyle: 'italic' }}>
                  (Số tiền bản quyền chi trả (tính theo năm) = Mức lương cơ sở x Hệ số điều chỉnh)
                </td>
              </tr>
            </thead>
            <tbody>
              {b.tiers.map((t, ti) => (
                <tr key={ti}>
                  {ti === 0 && (
                    <td
                      rowSpan={b.tiers.length}
                      style={{ ...cell, textAlign: 'center', fontWeight: 700, verticalAlign: 'middle' }}
                    >
                      {b.scaleText}
                    </td>
                  )}
                  <td style={{ ...cell, width: '22%' }}>{t.label}</td>
                  {t.hideFormula ? (
                    <td colSpan={3} style={{ ...cell, textAlign: 'center', fontStyle: 'italic', color: C.muted }}>
                      Mức trọn gói theo biểu mức
                    </td>
                  ) : (
                    <>
                      <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>{vnd(model.baseSalary)} đồng</td>
                      <td style={{ ...cell, textAlign: 'center', width: 18 }}>x</td>
                      <td style={{ ...cell, textAlign: 'center', whiteSpace: 'nowrap' }}>{t.coefText}/năm</td>
                    </>
                  )}
                  <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>{vnd(t.amount)}</td>
                </tr>
              ))}

              {(b.tiers.length > 1 || b.urbanFactor !== 1 || b.cappedNote) && (
                <tr>
                  <td colSpan={5} style={{ ...cell, textAlign: 'right', fontWeight: 700, background: C.band }}>
                    Cộng tiền bản quyền theo khung giá
                  </td>
                  <td style={{ ...cell, textAlign: 'right', fontWeight: 700, background: C.band }}>
                    {vnd(b.subTotalRaw)}
                  </td>
                </tr>
              )}
              {b.cappedNote && (
                <tr>
                  <td colSpan={6} style={{ ...cell, textAlign: 'center', fontStyle: 'italic', color: C.danger }}>
                    {b.cappedNote}
                  </td>
                </tr>
              )}
              {!b.urbanExempt && b.urbanFactor !== 1 && b.urbanLabel && (
                <tr>
                  <td colSpan={5} style={{ ...cell, textAlign: 'right', fontStyle: 'italic', background: C.band }}>
                    Tỷ lệ áp dụng theo phân loại đô thị:
                  </td>
                  <td style={{ ...cell, textAlign: 'left', fontWeight: 700, background: C.band }}>
                    {b.urbanLabel} ({Math.round(b.urbanFactor * 100)}%)
                  </td>
                </tr>
              )}
              {b.urbanFactor !== 1 && (
                <tr>
                  <td colSpan={5} style={{ ...cell, textAlign: 'right', fontWeight: 700, background: C.band }}>
                    Áp dụng tỷ lệ đô thị{b.urbanLabel ? ` — ${b.urbanLabel}` : ''} (x {fmtFactor(b.urbanFactor)})
                  </td>
                  <td style={{ ...cell, textAlign: 'right', fontWeight: 700, background: C.band }}>
                    {vnd(b.subTotalAfterUrban)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      <table className="mt-2 w-full" style={{ borderCollapse: 'collapse' }}>
        <tbody>
          {model.blocks.length > 1 && (
            <TotalRow label="Cộng tiền bản quyền" value={vnd(model.royaltyTotal)} />
          )}
          {model.supportPct > 0 && (
            <TotalRow
              label={`Mức hỗ trợ cho năm ${model.supportYear} (${(model.supportPct * 100).toFixed(0)}%)`}
              value={`-${vnd(model.supportAmount)}`}
              danger
            />
          )}
          {model.customFees.map((f, i) => (
            <TotalRow key={i} label={f.label || 'Chi phí khác'} value={vnd(f.amount)} plain />
          ))}
          <TotalRow label="Cộng" value={vnd(model.subtotal)} />
          <TotalRow label={`Tiền Thuế GTGT ${(model.vatPct * 100).toFixed(0)}%`} value={vnd(model.vatAmount)} />
          <TotalRow
            label={`Tổng giá trị hợp đồng cho ${model.contractMonths} tháng sử dụng`}
            value={vnd(model.grandTotal)}
            emphasis
          />
          <tr>
            <td colSpan={2} style={{ border: bd, padding: '5px 6px', fontSize: 12.5, textAlign: 'center', fontStyle: 'italic' }}>
              (Bằng chữ: {model.amountInWords}./.)
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ border: bd, padding: '5px 6px', fontSize: 11.5, textAlign: 'center', fontStyle: 'italic', color: C.muted }}>
              {model.legalNote}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function TotalRow({
  label, value, emphasis, danger, plain,
}: { label: string; value: string; emphasis?: boolean; danger?: boolean; plain?: boolean }) {
  const base: React.CSSProperties = {
    border: '1px solid #9DBE6E',
    padding: emphasis ? '7px 6px' : '5px 6px',
    fontSize: emphasis ? 14 : 12.5,
    fontWeight: plain ? 400 : 700,
    color: danger ? C.danger : emphasis ? C.navy : C.ink,
    background: emphasis ? C.navySoft : undefined,
  };
  return (
    <tr>
      <td style={{ ...base, textAlign: 'right', width: '81%' }}>{label}</td>
      <td style={{ ...base, textAlign: 'right', whiteSpace: 'nowrap' }}>{value}</td>
    </tr>
  );
}

/* ── Primitives ──────────────────────────────────────────────────────────── */

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: C.muted }}>{title}</h4>
        {action}
      </div>
      {children}
    </div>
  );
}

function Input({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border px-2.5 py-2 text-[12.5px] outline-none focus:border-[#4A7202]"
      style={{ borderColor: C.line, background: C.subtle, color: C.ink }}
    />
  );
}

function Textarea({ value, onChange, rows }: { value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <textarea
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className="w-full resize-none rounded border px-2.5 py-2 text-[12px] leading-relaxed outline-none focus:border-[#4A7202]"
      style={{ borderColor: C.line, background: C.subtle, color: C.ink }}
    />
  );
}