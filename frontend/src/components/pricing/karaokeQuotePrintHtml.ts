/**
 * buildKaraokeQuotePrintHtml — generates a self-contained A4 HTML document
 * used for "Save as PDF" via window.open / iframe print.
 *
 * This is INDEPENDENT of:
 * - The in-app preview panel (KaraokeQuotePreview / QuotePreviewDialog)
 * - Tailwind, dialog overlays, app CSS, scaling/zoom transforms
 *
 * Output is a standalone HTML document that, when printed, produces a
 * clean, professional A4 quote with fixed-column pricing table, no
 * duplicate legal note, and a clearly highlighted grand total.
 */
import {
  BASE_SALARY_LEGAL_NOTE,
  KARAOKE_AREA_LABEL,
  formatVND,
  formatCoef,
  getSupportRateLabel,
  type PricingSnapshot,
} from '../../lib/pricingSnapshot';
import type { KaraokeWorkspaceContext } from './KaraokePricingWorkspace';

const NAVY = '#00384D';
const WHITE = '#ffffff';
const PALE = '#f3f4f6';
const BORDER = '#333333';

function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tierSuffix(i: number): string {
  return i === 0 ? 'đầu' : i === 1 ? 'tiếp theo' : 'còn lại';
}

/**
 * Build the standalone A4 print HTML for a karaoke pricing snapshot.
 * Always produces an HTML string; never throws.
 */
export function buildKaraokeQuotePrintHtml(args: {
  snapshot: PricingSnapshot;
  context?: KaraokeWorkspaceContext;
}): string {
  const { snapshot: s, context } = args;

  const today = new Date().toLocaleDateString('vi-VN');
  const totalRooms = (s.rows ?? []).reduce((n, r) => n + (r.quantity ?? 0), 0);
  const areaLabel =
    (context?.areaGroup && KARAOKE_AREA_LABEL[context.areaGroup]) ||
    s.context_label ||
    '';

  // Filter tier rows that are non-empty (defensive — also filters by quantity>0).
  const visibleRows = (s.rows ?? []).filter(
    (r) => (r.quantity ?? 0) > 0 && (r.amount ?? 0) >= 0,
  );

  const supportRate = Number(s.support_rate_percent ?? 0);
  const vatPct = (s.vat_rate * 100).toFixed(0);

  // Note: legal note is rendered EXACTLY ONCE at the bottom of the document.
  const legalNote = s.note || BASE_SALARY_LEGAL_NOTE;

  const tierRowsHtml = visibleRows
    .map((r, i) => `
        <tr>
          ${i === 0
            ? `<td class="room-cell" rowspan="${visibleRows.length}">${escapeHtml(totalRooms)} phòng</td>`
            : ''}
          <td>${escapeHtml(r.quantity)} phòng ${tierSuffix(i)}</td>
          <td class="num">${r.base_salary ? formatVND(r.base_salary) : ''}</td>
          <td class="sym">×</td>
          <td class="num">${r.coefficient !== undefined ? formatCoef(r.coefficient) : ''}</td>
          <td>${escapeHtml(r.unit ?? 'phòng/năm')}</td>
          <td class="num strong">${formatVND(r.amount ?? 0)}</td>
        </tr>`)
    .join('');

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>Tiền bản quyền âm nhạc</title>
<style>
  @page { size: A4 portrait; margin: 12mm 12mm; }

  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
  }
  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 11pt;
    line-height: 1.25;
    color: #111111;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .quote-page { width: 100%; }

  .header {
    border-bottom: 2px solid ${NAVY};
    padding-bottom: 8px;
    margin-bottom: 14px;
  }
  .header .org {
    font-size: 10pt;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: ${NAVY};
    font-weight: 700;
  }
  .header h1 {
    margin: 2px 0 2px 0;
    font-size: 16pt;
    font-weight: 700;
    color: ${NAVY};
    font-family: "Times New Roman", Times, serif;
  }
  .header .meta {
    color: #555;
    font-size: 10pt;
  }

  .info-block {
    margin: 0 0 12px 0;
    font-size: 11pt;
  }
  .info-block .row {
    margin: 2px 0;
  }
  .info-block .label {
    display: inline-block;
    min-width: 130px;
    font-weight: 700;
  }
  .info-block .empty {
    color: #888;
  }

  table.quote {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-top: 6px;
  }
  table.quote colgroup col.c1 { width: 15%; }
  table.quote colgroup col.c2 { width: 24%; }
  table.quote colgroup col.c3 { width: 16%; }
  table.quote colgroup col.c4 { width: 4%; }
  table.quote colgroup col.c5 { width: 8%; }
  table.quote colgroup col.c6 { width: 14%; }
  table.quote colgroup col.c7 { width: 19%; }

  table.quote th, table.quote td {
    border: 1px solid ${BORDER};
    padding: 5px 7px;
    vertical-align: middle;
    line-height: 1.25;
    font-size: 11pt;
    word-wrap: break-word;
  }
  table.quote thead th {
    background: ${NAVY};
    color: ${WHITE};
    font-weight: 700;
    text-align: center;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  table.quote thead th.right { text-align: center; }
  table.quote .num { text-align: right; }
  table.quote .sym { text-align: center; color: #444; }
  table.quote .strong { font-weight: 700; }
  table.quote .center { text-align: center; }

  table.quote .formula-row td {
    background: ${PALE};
    font-style: italic;
    color: ${NAVY};
    text-align: center;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  table.quote .room-cell {
    background: ${PALE};
    font-weight: 700;
    color: ${NAVY};
    text-align: center;
    font-size: 12pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  table.quote .support td {
    font-weight: 700;
    text-align: right;
  }
  table.quote .support td.support-rate {
    text-align: right;
    font-weight: 700;
  }

  /* GRAND TOTAL — must NEVER look washed out */
  table.quote .grand-total td {
    background: ${NAVY};
    color: ${WHITE};
    font-weight: 700;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  table.quote .grand-total td.num { text-align: right; }

  table.quote .amount-words td {
    font-style: italic;
    background: #ffffff;
    color: #111111;
  }

  .legal-note {
    margin-top: 10px;
    font-size: 10.5pt;
    color: #222;
    line-height: 1.35;
  }

  .signoff {
    margin-top: 28px;
    display: flex;
    justify-content: space-between;
    font-size: 11pt;
  }
  .signoff .col {
    width: 45%;
    text-align: center;
  }
  .signoff .col .who {
    font-style: italic;
    color: #444;
    margin-bottom: 56px;
  }

  @media print {
    body { background: #ffffff; }
  }
</style>
</head>
<body>
<div class="quote-page">

  <div class="header">
    <div class="org">VCPMC · Trung tâm Bảo vệ Quyền tác giả Âm nhạc Việt Nam</div>
    <h1>Tiền bản quyền âm nhạc</h1>
    <div class="meta">Ngày ${escapeHtml(today)} · Bảng tính tham khảo</div>
  </div>

  <div class="info-block">
    <div class="row"><span class="label">Lĩnh vực:</span> Karaoke</div>
    ${context?.customerName
      ? `<div class="row"><span class="label">Khách hàng:</span> ${escapeHtml(context.customerName)}</div>`
      : ''}
    ${context?.signboard
      ? `<div class="row"><span class="label">Bảng hiệu:</span> ${escapeHtml(context.signboard)}</div>`
      : ''}
    <div class="row"><span class="label">Quy mô:</span> ${escapeHtml(totalRooms)} phòng</div>
    ${areaLabel ? `<div class="row"><span class="label">Nhóm diện tích:</span> ${escapeHtml(areaLabel)}</div>` : ''}
    <div class="row"><span class="label">Thời hạn:</span> ${escapeHtml(s.duration_months)} tháng</div>
  </div>

  <table class="quote">
    <colgroup>
      <col class="c1" /><col class="c2" /><col class="c3" />
      <col class="c4" /><col class="c5" /><col class="c6" /><col class="c7" />
    </colgroup>
    <thead>
      <tr>
        <th>Số lượng<br/>phòng</th>
        <th colspan="5">Mức tiền bản quyền (chưa gồm thuế GTGT)</th>
        <th class="right">Thành tiền (đồng)</th>
      </tr>
    </thead>
    <tbody>
      <tr class="formula-row">
        <td colspan="7">Tiền bản quyền (theo năm) = Mức lương cơ sở × Hệ số điều chỉnh</td>
      </tr>
      ${tierRowsHtml}
      ${supportRate > 0
        ? `<tr class="support">
            <td colspan="6" style="text-align:right;font-weight:700;">${escapeHtml(getSupportRateLabel(supportRate))}</td>
            <td class="num support-rate">${escapeHtml(supportRate)}%</td>
          </tr>`
        : ''}
      <tr>
        <td colspan="6" class="num strong">Cộng</td>
        <td class="num strong">${formatVND(s.subtotal ?? 0)}</td>
      </tr>
      <tr>
        <td colspan="6" class="num">Thuế GTGT ${escapeHtml(vatPct)}%</td>
        <td class="num">${formatVND(s.vat_amount ?? 0)}</td>
      </tr>
      <tr class="grand-total">
        <td colspan="6" class="num">TỔNG GIÁ TRỊ HỢP ĐỒNG (${escapeHtml(s.duration_months)} tháng)</td>
        <td class="num">${formatVND(s.total ?? 0)}</td>
      </tr>
      ${s.amount_in_words
        ? `<tr class="amount-words">
            <td colspan="7"><strong>Bằng chữ:</strong> ${escapeHtml(s.amount_in_words)}./.</td>
          </tr>`
        : ''}
    </tbody>
  </table>

  <div class="legal-note">${escapeHtml(legalNote)}</div>

  <div class="signoff">
    <div class="col">
      <div class="who">Đại diện khách hàng</div>
      <div>(Ký, ghi rõ họ tên)</div>
    </div>
    <div class="col">
      <div class="who">Đại diện VCPMC</div>
      <div>(Ký, đóng dấu)</div>
    </div>
  </div>

</div>
</body>
</html>`;
}

/**
 * Open the standalone HTML in a new window and trigger the browser's
 * print dialog. Used by the in-app "In / PDF" button.
 *
 * Uses window.open so the PDF flow is fully isolated from the app DOM —
 * the user gets the clean A4 layout regardless of their app theme,
 * zoom level, or any in-app overlay.
 */
export function printKaraokeQuoteHtml(html: string): boolean {
  const win = window.open('', '_blank', 'width=900,height=1200');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // Defer to give the browser time to lay out before invoking print.
  setTimeout(() => {
    try {
      win.print();
    } catch {
      // Print is best-effort — if user dismisses or browser blocks it,
      // the new tab still shows the printable preview.
    }
  }, 250);
  return true;
}