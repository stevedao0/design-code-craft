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

/* ── Bản xem trước bảng tính (bám sát 1:1 bố cục file .xlsx) ─────────────── */

const PV = {
  head: '#4A7202',
  headText: '#FFFFFF',
  navy: '#4A7202',
  navySoft: '#EDF5E1',
  band: '#F6FAF1',
  total: '#E1EFCC',
  rule: '#BCD095',
  muted: '#6B7A5C',
  gold: '#B07D2B',
  danger: '#B03A2E',
  input: '#0000FF',
};

/** Bề rộng cột tương ứng width Excel [5,28,9,13,15,14,18] */
const COL_W = ['4.9%', '27.5%', '8.8%', '12.7%', '14.7%', '13.7%', '17.7%'];

const bd = `1px solid ${PV.rule}`;
const td: React.CSSProperties = { border: bd, padding: '3px 6px', fontSize: 11.5, color: C.ink, verticalAlign: 'middle' };

function SheetPreview({ model }: { model: ContractRoyaltyModel }) {
  return (
    <>
      {/* Dải tiêu đề */}
      <div style={{ background: PV.head, color: PV.headText, textAlign: 'center', fontWeight: 700, fontSize: 11, padding: '5px 6px' }}>
        {VCPMC.fullName} ({VCPMC.shortName})
      </div>
      <div style={{ textAlign: 'center', fontSize: 9.5, color: PV.muted, lineHeight: 1.35, padding: '3px 8px' }}>
        {VCPMC_HEAD_CONTACT_LINE}
      </div>
      <div style={{ textAlign: 'center', fontSize: 9.5, color: PV.muted, lineHeight: 1.35, padding: '0 8px 6px' }}>
        {VCPMC_SOUTH_CONTACT_LINE}
      </div>
      <h2 style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, color: PV.navy, textTransform: 'uppercase' }}>
        {model.documentTitle}
      </h2>
      <p style={{ textAlign: 'center', fontSize: 10.5, fontStyle: 'italic', color: PV.muted, marginTop: 2 }}>
        Căn cứ: {model.legalBasis}
      </p>

      {/* A. Thông tin đơn vị */}
      <SectionBand>A. THÔNG TIN ĐƠN VỊ SỬ DỤNG ÂM NHẠC</SectionBand>
      <Grid>
        <tbody>
          {([
            ['Đơn vị sử dụng', model.orgName || ''],
            ['Địa chỉ', model.orgAddress || ''],
            ['Người đại diện', model.orgRepresentative || ''],
            ['Thời hạn hợp đồng', `${model.contractMonths} tháng`],
            ['Ngày lập bảng tính', model.quoteDate],
          ] as Array<[string, string]>).map(([k, v]) => (
            <tr key={k}>
              <td colSpan={2} style={{ ...td, fontWeight: 700, color: PV.navy, background: PV.band }}>{k}</td>
              <td colSpan={5} style={td}>{v}</td>
            </tr>
          ))}
        </tbody>
      </Grid>

      {/* B. Tham số tính */}
      <SectionBand>B. THAM SỐ TÍNH</SectionBand>
      <Grid>
        <tbody>
          <tr>
            <td colSpan={2} style={{ ...td, fontWeight: 700, color: PV.navy, background: PV.band }}>Mức lương cơ sở (MLCS)</td>
            <td colSpan={2} style={{ ...td, fontWeight: 700, color: PV.input }}>{vnd(model.baseSalary)} đồng</td>
            <td colSpan={2} style={{ ...td, fontWeight: 700, color: PV.navy, background: PV.band, textAlign: 'right' }}>Thuế GTGT</td>
            <td style={{ ...td, fontWeight: 700, color: PV.input, textAlign: 'right' }}>{(model.vatPct * 100).toFixed(1)}%</td>
          </tr>
          <tr>
            <td colSpan={7} style={{ ...td, fontStyle: 'italic', fontSize: 10, color: PV.gold, background: PV.band }}>
              {model.legalNote}
            </td>
          </tr>
        </tbody>
      </Grid>

      {/* C. Chi tiết từng lĩnh vực */}
      <SectionBand>C. CHI TIẾT TIỀN BẢN QUYỀN THEO TỪNG LĨNH VỰC SỬ DỤNG</SectionBand>
      <p style={{ textAlign: 'center', fontStyle: 'italic', fontSize: 10, color: PV.muted, margin: '4px 0' }}>
        Thành tiền (tính theo năm) = Mức lương cơ sở × Hệ số điều chỉnh × Số lượng × Tỷ lệ đô thị
      </p>

      {model.blocks.map((b, bi) => {
        const perTier = b.urbanMode === 'PER_TIER' && !b.urbanExempt && b.urbanFactor !== 1;
        const ratePct = Math.round(b.urbanFactor * 100);
        const urbanName = b.urbanLabel || `${ratePct}%`;
        const showSubtotal = b.tiers.length > 1 || b.urbanFactor !== 1 || Boolean(b.cappedNote);
        const showUrbanRow = !b.urbanExempt && b.urbanFactor > 0 && b.urbanFactor !== 1 && !perTier;
        return (
          <div key={b.id} style={{ marginTop: 14 }}>
            <div style={{ background: PV.head, color: PV.headText, fontWeight: 700, fontSize: 11.5, padding: '5px 8px' }}>
              {bi + 1}. {b.locationName} — {b.fieldName}  ·  Quy mô: {b.scaleText}
            </div>
            <Grid>
              <tbody>
                <tr>
                  <td colSpan={7} style={{ ...td, fontStyle: 'italic', fontSize: 10, color: PV.gold, background: PV.band }}>
                    {b.urbanExempt || b.urbanFactor === 1
                      ? 'Cách tính: Tiền bản quyền = Tổng thành tiền các bậc (không áp tỷ lệ đô thị).'
                      : perTier
                        ? `Cách tính: Thành tiền từng bậc đã nhân tỷ lệ đô thị ${ratePct}% (${urbanName}); Tiền bản quyền = Tổng thành tiền các bậc.`
                        : `Cách tính: Tiền bản quyền = (Tổng thành tiền các bậc) × tỷ lệ ${ratePct}% (${urbanName}).`}
                  </td>
                </tr>
                <tr>
                  {['STT', 'Diễn giải bậc biểu mức', 'Số lượng', 'Hệ số/năm', 'Mức lương cơ sở', 'Tỷ lệ đô thị', 'Thành tiền (đồng)'].map((h, i) => (
                    <th key={h} style={{ ...td, fontWeight: 700, color: PV.navy, background: PV.navySoft, textAlign: i === 1 ? 'left' : 'center' }}>
                      {h}
                    </th>
                  ))}
                </tr>
                {b.tiers.map((t, ti) => (
                  <tr key={ti}>
                    <td style={{ ...td, textAlign: 'center' }}>{ti + 1}</td>
                    <td style={td}>{t.label}</td>
                    {t.hideFormula ? (
                      <td colSpan={3} style={{ ...td, textAlign: 'center', fontStyle: 'italic', color: PV.muted }}>
                        Mức trọn gói theo biểu mức
                      </td>
                    ) : (
                      <>
                        <td style={{ ...td, textAlign: 'center' }}>{t.qty}</td>
                        <td style={{ ...td, textAlign: 'center' }}>{t.coefText}</td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{vnd(model.baseSalary)}</td>
                      </>
                    )}
                    <td style={{ ...td, textAlign: 'center', fontWeight: perTier ? 700 : 400, color: perTier ? PV.navy : PV.muted }}>
                      {b.urbanExempt ? 'Miễn áp dụng' : `${perTier ? ratePct : 100}%`}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {vnd(perTier ? (t.amountAfterUrban ?? t.amount) : t.amount)}
                    </td>
                  </tr>
                ))}

                {showSubtotal && (
                  <tr>
                    <td colSpan={6} style={{ ...td, textAlign: 'right', fontWeight: 700, background: PV.band }}>Cộng tiền bản quyền</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, background: PV.band, whiteSpace: 'nowrap' }}>
                      {vnd(perTier ? b.subTotalAfterUrban : b.subTotalRaw)}
                    </td>
                  </tr>
                )}

                {b.cappedNote && (
                  <tr>
                    <td colSpan={7} style={{ ...td, textAlign: 'center', fontStyle: 'italic', color: PV.danger }}>{b.cappedNote}</td>
                  </tr>
                )}

                {showUrbanRow && (
                  <tr>
                    <td colSpan={5} style={{ ...td, textAlign: 'right', fontWeight: 700, background: PV.band }}>
                      Mức hỗ trợ áp dụng thu {urbanName} (NĐ 134/2026/NĐ-CP)
                    </td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: PV.navy, background: PV.band }}>{ratePct}%</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, background: PV.band, whiteSpace: 'nowrap' }}>
                      {vnd(b.subTotalAfterUrban)}
                    </td>
                  </tr>
                )}

                <tr>
                  <td colSpan={5} style={{ ...td, textAlign: 'right', fontWeight: 700, color: PV.navy, background: PV.total }}>
                    Tiền bản quyền — {b.locationName} · {b.fieldName}
                  </td>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: PV.navy, background: PV.total }}>
                    {b.urbanExempt ? 'Miễn' : `${ratePct}%`}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontSize: 12.5, color: PV.navy, background: PV.total, whiteSpace: 'nowrap' }}>
                    {vnd(b.subTotalAfterUrban)}
                  </td>
                </tr>
              </tbody>
            </Grid>
          </div>
        );
      })}

      {/* D. Tổng hợp theo khu vực */}
      <div style={{ marginTop: 16 }}>
        <SectionBand>D. TỔNG HỢP TIỀN BẢN QUYỀN THEO KHU VỰC</SectionBand>
        <Grid>
          <tbody>
            <tr>
              {[
                ['STT', 1, 'center'], ['Khu vực sử dụng', 1, 'left'], ['Lĩnh vực áp dụng', 1, 'left'],
                ['Quy mô', 1, 'center'], ['Tỷ lệ đô thị', 2, 'center'], ['Tiền bản quyền (đồng)', 1, 'center'],
              ].map(([h, span, al]) => (
                <th key={String(h)} colSpan={span as number}
                  style={{ ...td, fontWeight: 700, color: PV.headText, background: PV.head, textAlign: al as 'left' }}>
                  {h as string}
                </th>
              ))}
            </tr>
            {model.blocks.map((b, i) => (
              <tr key={b.id} style={{ background: i % 2 === 1 ? PV.band : undefined }}>
                <td style={{ ...td, textAlign: 'center' }}>{i + 1}</td>
                <td style={td}>{b.locationName}</td>
                <td style={td}>{b.fieldName}</td>
                <td style={{ ...td, textAlign: 'center' }}>{b.scaleText}</td>
                <td colSpan={2} style={{ ...td, textAlign: 'center' }}>
                  {b.urbanExempt
                    ? 'Miễn áp dụng'
                    : b.urbanLabel
                      ? `${b.urbanLabel} (${Math.round(b.urbanFactor * 100)}%)`
                      : fmtFactor(b.urbanFactor)}
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{vnd(b.subTotalAfterUrban)}</td>
              </tr>
            ))}

            <TotalRow label="Cộng tiền bản quyền" value={vnd(model.royaltyTotal)} />
            {model.supportPct > 0 && (
              <TotalRow
                label={`Mức hỗ trợ năm ${model.supportYear} (${(model.supportPct * 100).toFixed(0)}%)`}
                value={`-${vnd(model.supportAmount)}`}
                danger
              />
            )}
            {model.customFees.map((f, i) => (
              <TotalRow key={i} label={f.label?.trim() || 'Chi phí khác'} value={vnd(f.amount)} plain />
            ))}
            <TotalRow label="Cộng" value={vnd(model.subtotal)} />
            <TotalRow label={`Tiền thuế GTGT ${(model.vatPct * 100).toFixed(0)}%`} value={vnd(model.vatAmount)} />
            <TotalRow
              label={`TỔNG GIÁ TRỊ HỢP ĐỒNG (${model.contractMonths} tháng sử dụng)`}
              value={vnd(model.grandTotal)}
              emphasis
            />
            <tr>
              <td colSpan={7} style={{ ...td, textAlign: 'center', fontStyle: 'italic', fontWeight: 700, color: PV.navy }}>
                Bằng chữ: {model.amountInWords}./.
              </td>
            </tr>
          </tbody>
        </Grid>
      </div>

      <p style={{ marginTop: 10, fontSize: 10, fontStyle: 'italic', color: PV.muted, lineHeight: 1.5 }}>
        Ghi chú: Tiền bản quyền được tính theo Phụ lục biểu mức của Nghị định 17/2023/NĐ-CP, trên mức lương cơ sở {vnd(model.baseSalary)} đồng/tháng.
        Cột “Tỷ lệ đô thị” là tỷ lệ được áp dụng cho khu vực đó; cột “Thành tiền” là số tiền đã áp tỷ lệ này.
        Ô “Mức lương cơ sở (MLCS)” và ô “Thuế GTGT” là ô nhập (chữ xanh); thay đổi hai ô này, toàn bộ bảng tự tính lại.
      </p>
    </>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <colgroup>{COL_W.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      {children}
    </table>
  );
}

function SectionBand({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 14, background: PV.navySoft, color: PV.navy, fontWeight: 700,
        fontSize: 11.5, padding: '4px 8px', border: bd,
      }}
    >
      {children}
    </div>
  );
}

function TotalRow({
  label, value, emphasis, danger, plain,
}: { label: string; value: string; emphasis?: boolean; danger?: boolean; plain?: boolean }) {
  const base: React.CSSProperties = {
    border: emphasis ? `1px solid ${PV.head}` : bd,
    padding: emphasis ? '7px 6px' : '5px 6px',
    fontSize: emphasis ? 13 : 11.5,
    fontWeight: plain ? 400 : 700,
    color: danger ? PV.danger : emphasis ? PV.headText : C.ink,
    background: emphasis ? PV.head : PV.band,
  };
  return (
    <tr>
      <td colSpan={6} style={{ ...base, textAlign: 'right' }}>{label}</td>
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