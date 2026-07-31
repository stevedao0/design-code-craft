import React, { useState, useRef } from "react";
import {
  UploadIcon,
  FileSpreadsheetIcon,
  DownloadIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  XCircleIcon,
  XIcon,
  LoaderIcon,
  FileIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { Page, PageHeader } from "../components/app-ui/Page";
import { ContentCard } from "../components/app-ui/ContentCard";
import { Button } from "../components/app-ui/Button";
import { Modal } from "../components/app-ui/Modal";
import { StepIndicator } from "../components/app-ui/StepIndicator";
import { RouteKey } from "../data/routes";
import { importContracts, getTemplateUrl, type ImportResult } from "../lib/importClient";
import { useAuth } from "../lib/auth";

interface ImportContractsPageProps {
  onNavigate: (route: RouteKey) => void;
}

function formatFileSize(bytes: number): string {
  if (!bytes || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(ts?: number): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("vi-VN");
  } catch {
    return "—";
  }
}

export function ImportContractsPage({ onNavigate }: ImportContractsPageProps) {
  const { currentUser } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canUpload = currentUser?.backendRole === "admin" || currentUser?.backendRole === "mod";

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSetFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const validateAndSetFile = (file: File) => {
    setError(null);
    setImportResult(null);
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError("Chỉ chấp nhận file Excel (.xlsx, .xls)");
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setShowConfirm(false);
    setIsUploading(true);
    setError(null);
    setImportResult(null);

    try {
      const result = await importContracts(selectedFile);
      setImportResult(result);
      setShowResultModal(true);
    } catch (err: any) {
      setError(err?.message || "Upload thất bại");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const url = getTemplateUrl();
    const link = document.createElement("a");
    link.href = url;
    link.download = "contract_import_template.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (!canUpload) {
    return (
      <Page>
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <AlertCircleIcon className="w-16 h-16 text-amber-500" />
          <h2 className="text-xl font-semibold text-zinc-800">Không có quyền truy cập</h2>
          <p className="text-zinc-500 text-center max-w-md">
            Chỉ admin và quản lý mới được phép nhập dữ liệu hợp đồng từ file Excel.
          </p>
          <Button onClick={() => onNavigate("dashboard")}>Quay về Dashboard</Button>
        </div>
      </Page>
    );
  }

  const hasResult = !!importResult;
  const steps = [
    { label: "Chọn file", completed: !!selectedFile || hasResult },
    { label: "Xác nhận", completed: isUploading || hasResult },
    { label: "Kết quả", completed: hasResult },
  ];

  const total = importResult?.total_rows ?? 0;
  const success = importResult?.success_count ?? 0;
  const errors = importResult?.error_count ?? 0;

  return (
    <Page>
      <PageHeader
        title="Import hợp đồng"
        description="Nhập dữ liệu hợp đồng từ file Excel vào hệ thống chính. Hãy kiểm tra kỹ file trước khi import — dữ liệu sẽ được ghi trực tiếp vào CSDL."
        breadcrumb="Admin / Import"
        actions={
          <Button
            variant="secondary"
            leftIcon={<DownloadIcon className="w-4 h-4" />}
            onClick={handleDownloadTemplate}
          >
            Tải template
          </Button>
        }
      />

      <div className="mb-4">
        <StepIndicator steps={steps} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <ContentCard>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-zinc-800">Chọn file Excel</h3>
                <span className="text-xs text-zinc-500">Hỗ trợ .xlsx, .xls</span>
              </div>

              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
                  isDragging
                    ? "border-[#c89968] bg-[#c89968]/5"
                    : selectedFile
                      ? "border-green-400 bg-green-50/60"
                      : "border-zinc-300 hover:border-[#c89968]/50 hover:bg-[#c89968]/5"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  id="file-upload"
                  onChange={handleFileSelect}
                />

                {selectedFile ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                      <FileSpreadsheetIcon className="w-7 h-7 text-green-600" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-zinc-800 break-all">{selectedFile.name}</p>
                      <p className="text-xs text-zinc-500 mt-1">
                        {formatFileSize(selectedFile.size)} · Cập nhật {formatDate(selectedFile.lastModified)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        leftIcon={<UploadIcon className="w-4 h-4" />}
                      >
                        Đổi file
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFile}
                        leftIcon={<XIcon className="w-4 h-4" />}
                      >
                        Xóa file
                      </Button>
                    </div>
                  </div>
                ) : (
                  <label htmlFor="file-upload" className="cursor-pointer block">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-[#c89968]/10 flex items-center justify-center">
                        <UploadIcon className="w-7 h-7 text-[#c89968]" />
                      </div>
                      <div>
                        <p className="font-medium text-zinc-800">Kéo thả file Excel vào đây</p>
                        <p className="text-sm text-zinc-500 mt-1">
                          hoặc{" "}
                          <span className="text-[#c89968] font-medium hover:underline">chọn file</span>
                        </p>
                      </div>
                    </div>
                  </label>
                )}
              </div>

              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                  <XCircleIcon className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                  <ShieldAlertIcon className="w-3.5 h-3.5 text-amber-500" />
                  Dữ liệu sẽ được ghi vào CSDL chính. Hãy kiểm tra file trước khi xác nhận.
                </p>
                <div className="flex gap-2">
                  {selectedFile && !isUploading && (
                    <Button variant="secondary" onClick={clearFile}>
                      Hủy
                    </Button>
                  )}
                  <Button
                    onClick={() => setShowConfirm(true)}
                    disabled={!selectedFile || isUploading}
                    leftIcon={
                      isUploading ? (
                        <LoaderIcon className="w-4 h-4 animate-spin" />
                      ) : (
                        <UploadIcon className="w-4 h-4" />
                      )
                    }
                  >
                    {isUploading ? "Đang import..." : "Import vào hệ thống"}
                  </Button>
                </div>
              </div>
            </div>
          </ContentCard>

          {hasResult && (
            <ContentCard>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-zinc-800">Kết quả import gần nhất</h3>
                  <Button variant="ghost" size="sm" onClick={() => setShowResultModal(true)}>
                    Xem chi tiết
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="p-3 rounded-lg bg-zinc-50 ring-1 ring-zinc-200">
                    <p className="text-xs text-zinc-500">Tổng dòng</p>
                    <p className="text-xl font-semibold text-zinc-800">{total}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 ring-1 ring-green-200">
                    <p className="text-xs text-green-700">Đã import</p>
                    <p className="text-xl font-semibold text-green-700">{success}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 ring-1 ring-red-200">
                    <p className="text-xs text-red-700">Lỗi</p>
                    <p className="text-xl font-semibold text-red-700">{errors}</p>
                  </div>
                </div>
              </div>
            </ContentCard>
          )}
        </div>

        <div>
          <ContentCard>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-zinc-800 mb-4">Hướng dẫn</h3>

              <div className="space-y-4">
                {[
                  { n: 1, title: "Tải template", desc: "Tải file Excel mẫu để đảm bảo đúng cấu trúc cột." },
                  { n: 2, title: "Điền dữ liệu", desc: "Nhập thông tin hợp đồng theo từng dòng trong file." },
                  { n: 3, title: "Chọn & xác nhận", desc: "Upload file rồi xác nhận trước khi ghi vào CSDL." },
                ].map((s) => (
                  <div key={s.n} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#c89968] text-white flex items-center justify-center text-sm font-semibold shrink-0">
                      {s.n}
                    </div>
                    <div>
                      <p className="font-medium text-zinc-800">{s.title}</p>
                      <p className="text-sm text-zinc-500 mt-0.5">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-zinc-200">
                <h4 className="font-medium text-zinc-700 mb-2">Lưu ý</h4>
                <ul className="text-sm text-zinc-600 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">*</span>
                    <span>Số hợp đồng và Năm là bắt buộc.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">!</span>
                    <span>Các trường khác có thể bỏ trống.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-lime-500 mt-0.5">i</span>
                    <span>Hợp đồng trùng sẽ được cập nhật theo dữ liệu mới.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 mt-0.5">i</span>
                    <span>Định dạng ngày: DD/MM/YYYY.</span>
                  </li>
                </ul>
              </div>

              <div className="mt-6 p-3 bg-lime-50 rounded-lg">
                <p className="text-xs text-lime-700">
                  <strong>Lĩnh vực hỗ trợ:</strong> karaoke, cafe, nha_hang, khach_san
                </p>
              </div>
            </div>
          </ContentCard>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Xác nhận import"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
            <ShieldAlertIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              Dữ liệu trong file sẽ được ghi trực tiếp vào CSDL chính. Hợp đồng trùng số sẽ bị cập nhật theo file. Thao tác này không thể hoàn tác tự động.
            </div>
          </div>
          {selectedFile && (
            <div className="p-3 rounded-lg bg-zinc-50 ring-1 ring-zinc-200 text-sm">
              <p className="font-medium text-zinc-800 break-all">{selectedFile.name}</p>
              <p className="text-xs text-zinc-500 mt-1">
                {formatFileSize(selectedFile.size)} · Cập nhật {formatDate(selectedFile.lastModified)}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowConfirm(false)} disabled={isUploading}>
              Hủy
            </Button>
            <Button onClick={handleUpload} disabled={isUploading}
              leftIcon={isUploading ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <UploadIcon className="w-4 h-4" />}
            >
              {isUploading ? "Đang import..." : "Xác nhận import"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Result Modal */}
      <Modal
        isOpen={showResultModal}
        onClose={() => setShowResultModal(false)}
        title="Kết quả import"
      >
        <div className="p-6">
          {importResult && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
                <div className="text-center p-4 bg-zinc-50 rounded-lg ring-1 ring-zinc-200">
                  <FileIcon className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-zinc-700">{total}</p>
                  <p className="text-sm text-zinc-600">Tổng dòng</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg ring-1 ring-green-200">
                  <CheckCircle2Icon className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-green-700">{success}</p>
                  <p className="text-sm text-green-600">Đã import</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg ring-1 ring-red-200">
                  <XCircleIcon className="w-8 h-8 text-red-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-red-700">{errors}</p>
                  <p className="text-sm text-red-600">Lỗi</p>
                </div>
              </div>

              {importResult.errors.length > 0 ? (
                <div>
                  <h4 className="font-medium text-zinc-700 mb-2">Chi tiết lỗi</h4>
                  <div className="max-h-60 overflow-y-auto border border-red-200 rounded-lg">
                    <table className="vc-datatable">
                      <thead className="bg-red-50 sticky top-0">
                        <tr>
                          <th className="text-left p-2 font-medium w-16">Dòng</th>
                          <th className="text-left p-2 font-medium">Lỗi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.errors.map((err, idx) => (
                          <tr key={idx} className="border-t border-red-100 align-top">
                            <td className="p-2 font-mono text-zinc-700">{err.row}</td>
                            <td className="p-2 text-red-700">
                              <ul className="list-disc list-inside space-y-0.5">
                                {err.errors.map((e, i) => (
                                  <li key={i}>{e}</li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                  Tất cả {total} dòng đã được xử lý không có lỗi.
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setShowResultModal(false)}>
                  Đóng
                </Button>
                <Button
                  onClick={() => {
                    setShowResultModal(false);
                    clearFile();
                    setImportResult(null);
                  }}
                >
                  Import file khác
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </Page>
  );
}
