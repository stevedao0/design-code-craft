/**
 * PHASE CONTRACTS-ACTIONS-EDIT-01: Edit Contract Page
 *
 * Edit contract using CreateContractPage structure as base.
 * - Load contract detail from GET /api/contracts/{id}
 * - Map DB row to editable form fields
 * - Call PATCH /api/contracts/{id} for direct update to main DB
 * - Permission check: requires contracts:edit or contracts:write permission
 */

import React, { useEffect, useState } from 'react';
import {
  ArrowLeftIcon,
  SaveIcon,
  LoaderIcon,
  CheckCircle2Icon,
  XCircleIcon,
  LockIcon,
  FileDownIcon,
} from 'lucide-react';
import { Page, PageHeader } from '../components/app-ui/Page';
import { ContentCard } from '../components/app-ui/ContentCard';
import { Button } from '../components/app-ui/Button';
import { Input } from '../components/app-ui/Input';
import { Select } from '../components/app-ui/Select';
import { FormSection } from '../components/app-ui/FormSection';
import { FieldGrid } from '../components/app-ui/FieldGrid';
import { MusicUsageAreaSection, type MusicUsageArea } from '../components/contract/MusicUsageAreaSection';
import { EmptyState } from '../components/app-ui/EmptyState';
import { StatusBadge } from '../components/app-ui/StatusBadge';
import { TableSkeleton } from '../components/app-ui/TableSkeleton';
import {
  ApiContractDetail,
  getContractDetail,
  updateContract,
  exportDocxPreview,
  type UpdateContractResponse,
  type ExportPreviewResult,
} from '../lib/contractsClient';
import { formatDate } from '../lib/format';
import { RouteKey } from '../data/routes';
import { useAuth } from '../lib/auth';

const TOKEN_KEY = 'vcpmc_new_app_access_token';

export function ContractEditPage({
  contractId,
  onBack,
  onSaved,
}: {
  contractId: number | null;
  onBack: () => void;
  onSaved?: (id: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('contracts.update');
  const [detail, setDetail] = useState<ApiContractDetail | null>(null);

  // Editable form state
  const [formData, setFormData] = useState<EditableContractForm | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<UpdateContractResponse | null>(null);
  const [saveError, setSaveError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<ExportPreviewResult | null>(null);
  const [previewError, setPreviewError] = useState('');

  // Load contract detail
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!contractId) {
        setDetail(null);
        setFormData(null);
        setLoading(false);
        setError('Khong co hợp đồng duoc chon.');
        return;
      }
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) throw new Error('Phien dang nhap khong hop le. Vui long dang nhap lai.');
        const data = await getContractDetail(token, contractId);
        if (cancelled) return;
        setDetail(data);
        setFormData(mapDetailToForm(data));
      } catch (err: any) {
        if (cancelled) return;
        setDetail(null);
        setFormData(null);
        setError(String(err?.message || 'Khong tai duoc chi tiet hợp đồng.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [contractId]);

  const handleFieldChange = (field: keyof EditableContractForm, value: string | number | boolean) => {
    setFormData((prev) => prev ? { ...prev, [field]: value } : prev);
    setSaveResult(null);
    setSaveError('');
  };

  const handleWordPreview = async () => {
    if (!detail) return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setPreviewError('Phien dang nhap khong hop le.');
      return;
    }
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewResult(null);
    try {
      const result = await exportDocxPreview(token, detail.id, { include_blocks: true });
      setPreviewResult(result);
    } catch (err: any) {
      setPreviewError(String(err?.message || 'Loi khi tao Word preview.'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const isKaraoke = detail?.domain?.display === 'Karaoke';

  const handleSave = async () => {
    if (!detail || !formData) return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setSaveError('Phien dang nhap khong hop le.');
      return;
    }
    setIsSaving(true);
    setSaveError('');
    setSaveResult(null);

    // Build payload with proper format conversion
    const payload: Record<string, unknown> = {
      // Contract number - always editable, always send full value
      ...(formData.contract_no !== undefined && { contract_no: formData.contract_no }),
      // Ngay lap hợp đồng / contract year
      ...(formData.ngay_lap_hop_dong !== undefined && { ngay_lap_hop_dong: formData.ngay_lap_hop_dong }),
      ...(formData.contract_year !== undefined && { contract_year: Number(formData.contract_year) || null }),
      // Region / field / domain
      ...(formData.region_code !== undefined && { region_code: formData.region_code }),
      ...(formData.field_code !== undefined && { field_code: formData.field_code }),
      ...(formData.linh_vuc !== undefined && { linh_vuc: formData.linh_vuc }),
      // Partner info
      ...(formData.don_vi_ten !== undefined && { don_vi_ten: formData.don_vi_ten }),
      ...(formData.ten_bang_hieu !== undefined && { ten_bang_hieu: formData.ten_bang_hieu }),
      ...(formData.don_vi_dien_thoai !== undefined && { don_vi_dien_thoai: formData.don_vi_dien_thoai }),
      ...(formData.don_vi_email !== undefined && { don_vi_email: formData.don_vi_email }),
      ...(formData.don_vi_nguoi_dai_dien !== undefined && { don_vi_nguoi_dai_dien: formData.don_vi_nguoi_dai_dien }),
      ...(formData.don_vi_chuc_vu !== undefined && { don_vi_chuc_vu: formData.don_vi_chuc_vu }),
      ...(formData.don_vi_mst !== undefined && { don_vi_mst: formData.don_vi_mst }),
      // Legal address — all aliases point to the same user input
      ...(formData.don_vi_dia_chi !== undefined && { don_vi_dia_chi: formData.don_vi_dia_chi }),
      ...(formData.legal_address_line !== undefined && { legal_address_line: formData.legal_address_line }),
      ...(formData.legal_full_address !== undefined && { legal_full_address: formData.legal_full_address }),
      // usage_same_as_legal flag
      ...(formData.usage_same_as_legal !== undefined && { usage_same_as_legal: formData.usage_same_as_legal }),
      // Usage address — if same as legal, echo legal address; otherwise use usage input
      ...(formData.usage_same_as_legal
        ? {
            usage_address_line: formData.don_vi_dia_chi || formData.legal_full_address || '',
            usage_full_address: formData.don_vi_dia_chi || formData.legal_full_address || '',
            dia_chi_su_dung: formData.don_vi_dia_chi || formData.legal_full_address || '',
          }
        : {
            usage_address_line: formData.usage_address_line !== undefined ? formData.usage_address_line : '',
            usage_full_address: formData.usage_full_address !== undefined ? formData.usage_full_address : '',
            dia_chi_su_dung: formData.dia_chi_su_dung !== undefined ? formData.dia_chi_su_dung : '',
          }),
      // Term
      ...(formData.ngay_bat_dau !== undefined && { ngay_bat_dau: formData.ngay_bat_dau }),
      ...(formData.ngay_ket_thuc !== undefined && { ngay_ket_thuc: formData.ngay_ket_thuc }),
      // Phase 2 simplified royalty fields (canonical)
      ...(formData.royalty_amount_before_vat !== undefined && { royalty_amount_before_vat: formData.royalty_amount_before_vat }),
      ...(formData.vat_rate !== undefined && { vat_rate: formData.vat_rate }),
      ...(formData.vat_amount !== undefined && { vat_amount: formData.vat_amount }),
      ...(formData.royalty_amount_after_vat !== undefined && { royalty_amount_after_vat: formData.royalty_amount_after_vat }),
      // Renewal & notes
      ...(formData.renewal_status !== undefined && { renewal_status: formData.renewal_status }),
      ...(formData.contract_note !== undefined && { contract_note: formData.contract_note }),
      ...(formData.loai_hinh_karaoke !== undefined && { loai_hinh_karaoke: formData.loai_hinh_karaoke }),
      // Convert musicUsageAreas back to API format
      // pricing_label: backend hiển thị trên bảng tính/Word, fallback area_name khi rỗng.
      ...(formData.musicUsageAreas !== undefined && {
        music_usage_areas: formData.musicUsageAreas.map(a => ({
          area_name: a.areaName,
          scale_description: a.scaleDescription,
          music_usage_type: a.musicUsageType,
          pricing_label: (a.pricingLabel && a.pricingLabel.trim()) || null,
        })),
      }),
    };

    try {
      const result = await updateContract(token, detail.id, payload);
      setSaveResult(result);

      if (result.ok && result.write_performed) {
        // Success - reload data
        const data = await getContractDetail(token, detail.id);
        setDetail(data);
        setFormData(mapDetailToForm(data));
      } else if (!result.ok) {
        // Backend returned ok=false - show the reason
        let errorMsg = result.message || 'Loi khi luu hợp đồng.';

        // Format error message based on mode
        if (result.mode === 'permission_denied') {
          errorMsg = 'Bạn chưa có quyền chỉnh sửa hợp đồng.';
        } else if (result.mode === 'not_found') {
          errorMsg = 'Hợp đồng không tồn tại hoặc bạn không có quyền truy cập.';
        } else if (result.mode === 'validation_error' && result.errors?.length) {
          errorMsg = `Lỗi validation: ${result.errors.join('; ')}`;
        } else if (result.mode === 'success' || result.mode === 'updated') {
          // Success - will be handled by saveResult state
          errorMsg = '';
        } else if (!result.ok) {
          errorMsg = result.message || 'Lỗi không xác định khi lưu hợp đồng.';
        }

        setSaveError(errorMsg);
      }
    } catch (err: any) {
      // Network or HTTP error (non-2xx)
      let errorMessage = 'Loi khi luu hợp đồng.';
      if (err?.message) {
        if (err.message.includes('HTTP 403')) {
          errorMessage = 'Ban khong co quyen chinh sua hợp đồng nay.';
        } else if (err.message.includes('HTTP 404')) {
          errorMessage = 'Hop dong khong tim thay.';
        } else if (err.message.includes('HTTP 422')) {
          errorMessage = 'Du lieu khong hop le. Vui long kiem tra lai cac truong.';
        } else if (err.message.includes('HTTP 5')) {
          errorMessage = 'Loi may chu. Vui long thu lai sau.';
        } else {
          // Use raw message if it's meaningful
          const rawMsg = err.message.replace(/^HTTP \d+\s*/, '').trim();
          if (rawMsg && !rawMsg.startsWith('HTTP ')) {
            errorMessage = rawMsg;
          }
        }
      }
      console.error('[ContractEdit] Save error:', err);
      setSaveError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <Page>
        <PageHeader
          breadcrumb="/bg/contracts/edit"
          title="Chỉnh sửa hợp đồng"
          actions={
            <Button variant="secondary" leftIcon={<ArrowLeftIcon className="h-4 w-4" />} onClick={onBack}>
              Quay lại
            </Button>
          }
        />
        <TableSkeleton rows={6} cols={3} />
      </Page>
    );
  }

  if (error || !detail || !formData) {
    return (
      <Page>
        <PageHeader
          breadcrumb="/bg/contracts/edit"
          title="Chỉnh sửa hợp đồng"
          actions={
            <Button variant="secondary" leftIcon={<ArrowLeftIcon className="h-4 w-4" />} onClick={onBack}>
              Quay lại
            </Button>
          }
        />
        <EmptyState
          title="Khong tai duoc hợp đồng"
          description={error || 'Hop dong khong ton tai.'}
          icon={<XCircleIcon className="h-5 w-5" />}
          action={
            <Button variant="secondary" onClick={onBack}>Quay lại</Button>
          }
        />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        breadcrumb="/bg/contracts/edit"
        title={`Chỉnh sửa hợp đồng ${detail.contract_no}`}
        description="Chỉnh sửa thông tin hợp đồng tren DB chinh (port 5432)."
        actions={
          <div className="flex items-center gap-2">
            {!hasPermission('contracts.update') && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-md ring-1 ring-amber-600/20">
                <LockIcon className="h-3.5 w-3.5" />
                Read-only — Khong co quyen chinh sua
              </span>
            )}
            <Button variant="secondary" leftIcon={<ArrowLeftIcon className="h-4 w-4" />} onClick={onBack}>
              Quay lại
            </Button>
          </div>
        }
      />

      <ContentCard>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <StatusBadge tone="indigo">{detail.contract_no}</StatusBadge>
          <span className="text-sm text-zinc-500">#{detail.id}</span>
          <span className="text-sm text-zinc-500">Lĩnh vực: {detail.domain.display}</span>
          <span className="text-sm text-zinc-500">Domain group: {detail.domain.domain_group || '-'}</span>
        </div>
      </ContentCard>

      {/* ============================================================ */}
      {/* SECTION 1: THONG TIN CHUNG (READ-ONLY) */}
      {/* ============================================================ */}
      <FormSection
        title="1. Thông tin chung"
        description="So hợp đồng va ngay ky"
      >
        <FieldGrid cols={3}>
          <div>
            <p className="text-xs text-zinc-500 mb-1">So hợp đồng</p>
            <Input
              value={formData.contract_no ?? ""}
              onChange={(e) => {
                setFormData((prev) => prev ? { ...prev, contract_no: e.target.value } : prev);
                setSaveResult(null);
                setSaveError('');
              }}
              placeholder="VD: 700/2026/HĐQTGAN-PN/PR"
              className="font-mono"
            />
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Ngày ký</p>
            <Input
              type="date"
              value={formData.ngay_lap_hop_dong}
              onChange={(e) => handleFieldChange('ngay_lap_hop_dong', e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Nam hợp đồng</p>
            <Input
              type="number"
              value={formData.contract_year ?? ''}
              onChange={(e) => handleFieldChange('contract_year', e.target.value)}
              placeholder="VD: 2026"
              className="text-sm"
            />
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Mã vùng</p>
            <Input
              value={formData.region_code ?? ''}
              onChange={(e) => handleFieldChange('region_code', e.target.value)}
              placeholder="VD: PN, TN, QL"
              className="text-sm"
            />
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Mã quyền</p>
            <Select
              value={formData.field_code ?? ''}
              onChange={(v) => handleFieldChange('field_code', v)}
              options={[
                { value: 'PR', label: 'PR - Quyen Phat Song' },
                { value: 'MR', label: 'MR - Quyen Tai Tao' },
              ]}
            />
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Lĩnh vực</p>
            <Select
              value={formData.linh_vuc ?? ''}
              onChange={(v) => handleFieldChange('linh_vuc', v)}
              options={[
                { value: 'Karaoke', label: 'Karaoke' },
                { value: 'Background Music', label: 'Background Music' },
                { value: 'KVC', label: 'KVC' },
              ]}
            />
          </div>
        </FieldGrid>
        {isKaraoke && (
          <div className="mt-3">
            <p className="text-xs text-zinc-500 mb-1">Loai hinh karaoke</p>
            <Select
              value={formData.loai_hinh_karaoke || ''}
              onChange={(v) => handleFieldChange('loai_hinh_karaoke', v)}
              options={[
                { value: 'PHONG', label: 'Phong' },
                { value: 'BOX', label: 'Box' },
              ]}
              disabled={!canEdit}
            />
          </div>
        )}
      </FormSection>

      {/* ============================================================ */}
      {/* SECTION 2: THONG TIN DOI TAC */}
      {/* ============================================================ */}
      <FormSection
        title="2. Thông tin đối tác"
        description="Thong tin don vi, nguoi dai dien, dia chi"
      >
        <div className="space-y-4">
          <FieldGrid>
            <Input
              label="Ten don vi"
              value={formData.don_vi_ten}
              onChange={(e) => handleFieldChange('don_vi_ten', e.target.value)}
            />
            <Input
              label="Ten bang hieu"
              value={formData.ten_bang_hieu}
              onChange={(e) => handleFieldChange('ten_bang_hieu', e.target.value)}
            />
          </FieldGrid>
          <FieldGrid>
            <Input
              label="Người đại diện"
              value={formData.don_vi_nguoi_dai_dien}
              onChange={(e) => handleFieldChange('don_vi_nguoi_dai_dien', e.target.value)}
            />
            <Input
              label="Chức vụ"
              value={formData.don_vi_chuc_vu}
              onChange={(e) => handleFieldChange('don_vi_chuc_vu', e.target.value)}
            />
          </FieldGrid>
          <FieldGrid cols={3}>
            <Input
              label="Mã số thuế"
              value={formData.don_vi_mst}
              onChange={(e) => handleFieldChange('don_vi_mst', e.target.value)}
            />
            <Input
              label="Dien thoai"
              type="tel"
              value={formData.don_vi_dien_thoai}
              onChange={(e) => handleFieldChange('don_vi_dien_thoai', e.target.value)}
            />
            <Input
              label="Email"
              type="email"
              value={formData.don_vi_email}
              onChange={(e) => handleFieldChange('don_vi_email', e.target.value)}
            />
          </FieldGrid>
          <FieldGrid>
            <Input
              label="Dia chi don vi / phap ly"
              value={formData.don_vi_dia_chi || formData.legal_full_address || ''}
              onChange={(e) => {
                const val = e.target.value;
                handleFieldChange('don_vi_dia_chi', val);
                handleFieldChange('legal_full_address', val);
                handleFieldChange('legal_address_line', val);
              }}
              placeholder="VD: 123 Nguyen Hue, Phuong Ben Nghe, Quan 1, TP Ho Chi Minh"
            />
          </FieldGrid>

          {/* Checkbox: usage address same as legal */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="usage-same-as-legal"
              checked={formData.usage_same_as_legal ?? true}
              onChange={(e) => handleFieldChange('usage_same_as_legal', e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-lime-600 focus:ring-lime-500"
            />
            <label htmlFor="usage-same-as-legal" className="text-sm text-zinc-700">
              Địa chỉ sử dụng nhạc giống địa chỉ đơn vị
            </label>
          </div>

          {/* Usage address — only show when different from legal */}
          {formData.usage_same_as_legal !== true && (
            <FieldGrid>
              <Input
                label="Dia chi su dung nhac"
                value={formData.dia_chi_su_dung || formData.usage_full_address || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  handleFieldChange('dia_chi_su_dung', val);
                  handleFieldChange('usage_full_address', val);
                  handleFieldChange('usage_address_line', val);
                }}
                placeholder="VD: 456 Le Lai, Phuong Ben Thanh, Quan 1, TP Ho Chi Minh"
              />
            </FieldGrid>
          )}
        </div>
      </FormSection>

      {/* ============================================================ */}
      {/* SECTION 3: KHU VUC KINH DOANH (KARAOKE ONLY) */}
      {/* ============================================================ */}
      {formData && (
        <FormSection
          title="3. Khu vực kinh doanh"
          description="Khu vuc su dung am nhac"
        >
          <MusicUsageAreaSection
            value={formData.musicUsageAreas}
            onChange={(areas) => {
              setFormData((prev) => prev ? { ...prev, musicUsageAreas: areas } : prev);
              setSaveResult(null);
              setSaveError('');
            }}
            readOnly={!canEdit}
          />
        </FormSection>
      )}

      {/* ============================================================ */}
      {/* SECTION 4: THOI HAN & TAI CHINH */}
      {/* ============================================================ */}
      <FormSection
        title="4. Thời hạn và tài chính"
        description="Ngày bắt đầu, ngay ket thuc, tien ban quyen"
      >
        <div className="space-y-4">
          <FieldGrid cols={2}>
            <Input
              label="Ngày bắt đầu"
              type="date"
              value={formData.ngay_bat_dau}
              onChange={(e) => handleFieldChange('ngay_bat_dau', e.target.value)}
            />
            <Input
              label="Ngày kết thúc"
              type="date"
              value={formData.ngay_ket_thuc}
              onChange={(e) => handleFieldChange('ngay_ket_thuc', e.target.value)}
            />
          </FieldGrid>
          <FieldGrid cols={3}>
            <Input
              label="Tien truoc GTGT"
              type="number"
              value={String(formData.royalty_amount_before_vat ?? 0)}
              onChange={(e) => handleFieldChange('royalty_amount_before_vat', parseInt(e.target.value, 10) || 0)}
            />
            <Input
              label="Thuế GTGT (%)"
              type="number"
              value={String(formData.vat_rate ?? 0)}
              onChange={(e) => handleFieldChange('vat_rate', parseFloat(e.target.value) || 0)}
            />
            <Select
              label="Trang thai tai ky"
              value={formData.renewal_status || ''}
              onChange={(v) => handleFieldChange('renewal_status', v)}
              options={[
                { value: 'NEW', label: 'Moi (NEW)' },
                { value: 'PENDING_RENEWAL', label: 'Cho tai ky (PENDING_RENEWAL)' },
                { value: 'RENEWED', label: 'Da tai ky (RENEWED)' },
              ]}
            />
          </FieldGrid>
          {formData.royalty_amount_before_vat != null && (
            <div className="rounded-lg bg-zinc-50 p-3 text-sm">
              <p className="text-zinc-700">
                Tổng tiền (truoc GTGT): <strong>{(formData.royalty_amount_before_vat ?? 0).toLocaleString('vi-VN')} VND</strong>
              </p>
              {formData.vat_amount != null && (
                <p className="text-zinc-600 text-xs">
                  Tien thue GTGT ({formData.vat_rate ?? 0}%):{' '}
                  {(formData.vat_amount ?? 0).toLocaleString('vi-VN')} VND
                </p>
              )}
              {(formData.royalty_amount_after_vat != null) && (
                <p className="font-semibold text-zinc-900">
                  Tong cong:{' '}
                  {(formData.royalty_amount_after_vat ?? 0).toLocaleString('vi-VN')} VND
                </p>
              )}
            </div>
          )}
        </div>
      </FormSection>

      {/* ============================================================ */}
      {/* SECTION 5: WORD PREVIEW (KARAOKE ONLY) */}
      {/* ============================================================ */}
      {isKaraoke && (
        <ContentCard>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-zinc-900 mb-1">
                Tạo Word preview
              </h3>
              <p className="text-xs text-zinc-500">
                Tao file Word preview tu du lieu hien tai (da luu). Khong xuat chinh thuc, khong ghi DB, khong dinh kem docx_path.
              </p>

              {previewError && (
                <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-600/15">
                  {previewError}
                </div>
              )}

              {previewResult && (
                <div className="mt-3 space-y-2">
                  <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ring-1 ${previewResult.ok
                    ? 'bg-lime-50 text-lime-700 ring-lime-600/15'
                    : 'bg-rose-50 text-rose-700 ring-rose-600/15'}`}>
                    {previewResult.ok ? (
                      <CheckCircle2Icon className="h-4 w-4 shrink-0" />
                    ) : (
                      <XCircleIcon className="h-4 w-4 shrink-0" />
                    )}
                    <span className="font-semibold">
                      {previewResult.ok ? 'Preview tao thanh cong!' : 'Preview that bai'}
                    </span>
                  </div>
                  {previewResult.ok && (
                    <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs space-y-1">
                      {previewResult.preview_path && (
                        <div>
                          <span className="text-zinc-500">File: </span>
                          <span className="font-medium truncate" title={previewResult.preview_path}>
                            {previewResult.preview_path.split('\\').pop()}
                          </span>
                        </div>
                      )}
                      {previewResult.file_size && (
                        <div>
                          <span className="text-zinc-500">Size: </span>
                          <span className="font-medium">{(previewResult.file_size / 1024).toFixed(1)} KB</span>
                        </div>
                      )}
                      <div>
                        <span className="text-zinc-500">db_write: </span>
                        <span className={previewResult.db_write_performed ? 'text-rose-600 font-bold' : 'text-lime-600'}>
                          {previewResult.db_write_performed ? 'YES' : 'NO'}
                        </span>
                        {'  '}
                        <span className="text-zinc-500">docx_path: </span>
                        <span className={previewResult.docx_path_attached ? 'text-rose-600 font-bold' : 'text-lime-600'}>
                          {previewResult.docx_path_attached ? 'YES' : 'NO'}
                        </span>
                        {'  '}
                        <span className="text-zinc-500">official: </span>
                        <span className={previewResult.official_export ? 'text-rose-600 font-bold' : 'text-lime-600'}>
                          {previewResult.official_export ? 'YES' : 'NO'}
                        </span>
                      </div>
                      {previewResult.warnings && previewResult.warnings.length > 0 && (
                        <div className="mt-1">
                          {previewResult.warnings.map((w, i) => (
                            <p key={i} className="text-amber-600">- {w}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                leftIcon={previewLoading ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <FileDownIcon className="h-4 w-4" />}
                onClick={handleWordPreview}
                disabled={previewLoading || !detail}
              >
                {previewLoading ? 'Đang tạo...' : 'Tạo Word preview'}
              </Button>
            </div>
          </div>
        </ContentCard>
      )}

      {/* ============================================================ */}
      {/* SECTION 6: SAVE ACTION */}
      {/* ============================================================ */}
      <ContentCard>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-zinc-900 mb-1">
              Lưu thay đổi
            </h3>
            <p className="text-xs text-zinc-500">
              {canEdit
                ? 'Ghi ket qua len DB chinh. Khong xuat chinh thuc, khong tao GCN.'
                : 'Ban khong co quyen chinh sua hợp đồng nay.'}
            </p>

            {saveError && (
              <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-600/15">
                {saveError}
              </div>
            )}

            {saveResult && (
              <div className="mt-3 space-y-2">
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ring-1 ${saveResult.ok
                  ? 'bg-lime-50 text-lime-700 ring-lime-600/15'
                  : 'bg-rose-50 text-rose-700 ring-rose-600/15'}`}>
                  {saveResult.ok ? (
                    <CheckCircle2Icon className="h-4 w-4 shrink-0" />
                  ) : (
                    <XCircleIcon className="h-4 w-4 shrink-0" />
                  )}
                  <span className="font-semibold">{saveResult.message}</span>
                </div>
                {saveResult.ok && saveResult.updated_fields && saveResult.updated_fields.length > 0 && (
                  <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs">
                    <p className="font-semibold text-zinc-700 mb-1">Cap nhat thanh cong cac truong:</p>
                    <div className="flex flex-wrap gap-1">
                      {saveResult.updated_fields.map((f) => (
                        <span key={f} className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {!saveResult.ok && saveResult.errors && saveResult.errors.length > 0 && (
                  <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs">
                    {saveResult.errors.map((e, i) => (
                      <p key={i} className="text-rose-700">- {e}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {!canEdit && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                <LockIcon className="h-3.5 w-3.5" />
                Khong co quyen chinh sua
              </span>
            )}
            <Button
              variant="primary"
              leftIcon={isSaving ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <SaveIcon className="h-4 w-4" />}
              onClick={handleSave}
              disabled={!canEdit || isSaving}
            >
              {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </div>
        </div>
      </ContentCard>
    </Page>
  );
}

// =============================================================================
// TYPES & MAPPING
// =============================================================================

interface EditableContractForm {
  // Contract info (all editable)
  contract_no: string;
  ngay_lap_hop_dong: string;
  contract_year: number | null;
  region_code: string;
  field_code: string;
  linh_vuc: string;
  // Partner info
  don_vi_ten: string;
  ten_bang_hieu: string;
  don_vi_dia_chi: string;
  dia_chi_su_dung: string;
  don_vi_dien_thoai: string;
  don_vi_email: string;
  don_vi_nguoi_dai_dien: string;
  don_vi_chuc_vu: string;
  don_vi_mst: string;
  // Full address fields (post-2025 merger) — backed by DB columns, not all shown in simplified UI
  legal_address_line: string;
  legal_ward: string;
  legal_province: string;
  legal_full_address: string;
  usage_same_as_legal: boolean;
  usage_address_line: string;
  usage_ward: string;
  usage_province: string;
  usage_full_address: string;
  // Legacy alias fields (kept for DB mapping)
  dia_chi_su_dung: string;
  // Term
  ngay_bat_dau: string;
  ngay_ket_thuc: string;
  // Phase 2 simplified royalty fields
  royalty_amount_before_vat: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  royalty_amount_after_vat: number | null;
  renewal_status: string;
  loai_hinh_karaoke: string;
  musicUsageAreas: MusicUsageArea[];
  contract_note: string;
}

function mapDetailToForm(detail: ApiContractDetail): EditableContractForm {
  function toDateInputValue(value: string | null | undefined): string {
    if (!value) return '';
    if (value.includes('T')) return value.split('T')[0];
    if (value.includes('/')) {
      const parts = value.split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts;
        if (y.length === 4) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        if (d.length === 4) return `${d}-${m.padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    return value;
  }

  return {
    contract_no: detail.contract_no || '',
    ngay_lap_hop_dong: toDateInputValue(detail.dates?.signed_date),
    contract_year: detail.contract_year ?? null,
    region_code: detail.raw?.region_code || '',
    field_code: detail.domain?.field_code || '',
    linh_vuc: detail.domain?.display || '',
    don_vi_ten: detail.customer?.name || '',
    ten_bang_hieu: detail.customer?.signage || '',
    don_vi_dia_chi: detail.customer?.legal_address || '',
    dia_chi_su_dung: detail.customer?.usage_address || detail.customer?.address || '',
    don_vi_dien_thoai: detail.customer?.phone || '',
    don_vi_email: detail.customer?.email || '',
    don_vi_nguoi_dai_dien: detail.customer?.representative || '',
    don_vi_chuc_vu: detail.customer?.position || '',
    don_vi_mst: detail.customer?.mst || '',
    // Full address fields (post-2025 merger)
    legal_address_line: (detail.raw as any)?.legal_address_line || '',
    legal_ward: (detail.raw as any)?.legal_ward || '',
    legal_province: (detail.raw as any)?.legal_province || '',
    legal_full_address: (detail.raw as any)?.legal_full_address || '',
    usage_same_as_legal: (detail.raw as any)?.usage_same_as_legal ?? true,
    usage_address_line: (detail.raw as any)?.usage_address_line || '',
    usage_ward: (detail.raw as any)?.usage_ward || '',
    usage_province: (detail.raw as any)?.usage_province || '',
    usage_full_address: (detail.raw as any)?.usage_full_address || '',
    ngay_bat_dau: toDateInputValue(detail.dates?.start_date),
    ngay_ket_thuc: toDateInputValue(detail.dates?.end_date),
    // Load Phase 2 simplified royalty fields (canonical source)
    // Prefer Phase 2 fields, fall back to legacy fields for old contracts
    royalty_amount_before_vat: detail.royalty_amount_before_vat
      ?? detail.financial?.amount_before_gtgt
      ?? null,
    vat_rate: detail.vat_rate
      ?? detail.financial?.gtgt_percent
      ?? null,
    vat_amount: detail.vat_amount
      ?? detail.financial?.gtgt_amount
      ?? null,
    royalty_amount_after_vat: detail.royalty_amount_after_vat
      ?? detail.financial?.total_amount
      ?? null,
    renewal_status: (detail.raw?.renewal_status as string) || 'NEW',
    loai_hinh_karaoke: detail.karaoke?.type || '',
    // Load real music_usage_areas from API, fall back to legacy room_count/box_count
    musicUsageAreas: (() => {
      const apiAreas = detail.music_usage_areas;
      if (apiAreas && apiAreas.length > 0) {
        return apiAreas.map((a, i) => ({
          id: `area-edit-${Date.now()}-${i}`,
          areaName: a.area_name,
          scaleDescription: a.scale_description,
          musicUsageType: a.music_usage_type,
          pricingLabel: a.pricing_label ?? '',
        }));
      }
      const karaokeType = detail.karaoke?.type;
      if (karaokeType === 'PHONG' && (detail.karaoke?.room_count ?? 0) > 0) {
        return [{
          id: `area-edit-${Date.now()}-0`,
          areaName: 'Khu vực Karaoke',
          scaleDescription: `${detail.karaoke.room_count} phòng`,
          musicUsageType: 'Sử dụng nhạc qua đầu Karaoke',
        }];
      }
      if (karaokeType === 'BOX' && (detail.karaoke?.box_count ?? 0) > 0) {
        return [{
          id: `area-edit-${Date.now()}-0`,
          areaName: 'Khu vực Karaoke',
          scaleDescription: `${detail.karaoke.box_count} box`,
          musicUsageType: 'Sử dụng nhạc qua đầu Karaoke',
        }];
      }
      return [];
    })(),
    contract_note: '',
  };
}
