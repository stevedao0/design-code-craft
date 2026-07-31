import React, { useState } from 'react';
import { CameraIcon, FileImageIcon, FileTextIcon, Loader2Icon } from 'lucide-react';

/**
 * Menu xuất snapshot trang Báo cáo dưới dạng PNG hoặc PDF in trực tiếp.
 * - PNG: dùng html2canvas-pro chụp khu vực được tham chiếu, tải xuống.
 * - PDF: mở print dialog với @media print đã được tối ưu.
 */
export function ExportSnapshotMenu({
  targetRef,
  filename = 'bao-cao',
}: {
  targetRef: React.RefObject<HTMLElement | null>;
  filename?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'png' | null>(null);

  const closeSoon = () => setTimeout(() => setOpen(false), 100);

  const exportPng = async () => {
    if (!targetRef.current) return;
    setBusy('png');
    try {
      const { default: html2canvas } = await import('html2canvas-pro');
      const canvas = await html2canvas(targetRef.current, {
        backgroundColor: '#faf7f1',
        scale: Math.min(2, window.devicePixelRatio || 1.5),
        useCORS: true,
        logging: false,
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error('PNG export failed:', err);
      alert('Không thể xuất PNG. Vui lòng thử lại.');
    } finally {
      setBusy(null);
      closeSoon();
    }
  };

  const exportPdf = () => {
    // Sử dụng print → người dùng chọn "Save as PDF"
    document.documentElement.classList.add('print-snapshot');
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.documentElement.classList.remove('print-snapshot');
      }, 200);
    }, 60);
    closeSoon();
  };

  return (
    <div className="relative" data-hide-on-present="true">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium text-zinc-700 ring-1 ring-zinc-900/10 bg-white hover:bg-zinc-50 hover:ring-amber-700/30 transition-all">
        <CameraIcon className="h-4 w-4" />
        Snapshot
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-50 w-52 rounded-xl bg-white shadow-[0_14px_40px_-12px_rgba(28,22,16,0.25)] ring-1 ring-zinc-900/10 p-1.5 origin-top-right animate-in fade-in slide-in-from-top-1 duration-150">
            <button
              type="button"
              onClick={exportPng}
              disabled={busy === 'png'}
              className="w-full inline-flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] text-zinc-700 hover:bg-amber-50 hover:text-amber-900 transition-colors disabled:opacity-60">
              {busy === 'png' ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <FileImageIcon className="h-4 w-4" />
              )}
              Xuất PNG (full page)
            </button>
            <button
              type="button"
              onClick={exportPdf}
              className="w-full inline-flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] text-zinc-700 hover:bg-amber-50 hover:text-amber-900 transition-colors">
              <FileTextIcon className="h-4 w-4" />
              In / Lưu PDF
            </button>
            <p className="px-2.5 pt-1.5 pb-1 text-[10px] text-zinc-400 leading-snug">
              PNG chụp full nội dung. PDF dùng dialog in của trình duyệt — chọn "Save as PDF".
            </p>
          </div>
        </>
      )}
    </div>
  );
}
