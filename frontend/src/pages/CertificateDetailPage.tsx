import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeftIcon,
  RefreshCwIcon,
  SaveIcon,
  PrinterIcon,
} from 'lucide-react';
import { Page, PageHeader } from '../components/app-ui/Page';
import { ContentCard } from '../components/app-ui/ContentCard';
import { Button } from '../components/app-ui/Button';
import { Input } from '../components/app-ui/Input';
import { Textarea } from '../components/app-ui/Textarea';
import { Select } from '../components/app-ui/Select';
import { StatusBadge } from '../components/app-ui/StatusBadge';
import type { CertificateRecord } from '../data/certificateRecords';
import {
  CERTIFICATE_STATUS_LABEL,
  CertificateStatus,
} from '../data/certificateRecords';
import {
  getCertificate,
  updateCertificate,
  syncCertificate,
  printCertificate,
  assignCertificateNumber,
  getCertificatePrintLogs,
  type CertificateUpdatePayload,
  type CertificatePrintResponse,
  type CertificatePrintLogItem,
} from '../lib/certificatesClient';
import { formatDate } from '../lib/format';
import { RouteKey } from '../data/routes';

const TOKEN_KEY = 'vcpmc_new_app_access_token';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Bản nháp' },
  { value: 'final_printed', label: 'Đã in chính thức' },
];

type FormState = {
  certificate_no: string;
  certificate_issue_date: string;
  status: CertificateStatus;
  organization_name: string;
  business_registration_no: string;
  address: string;
  business_sign_name: string;
  business_location: string;
  contract_no: string;
  effective_from: string;
  effective_to: string;
  gcn_scope_col_1_text: string;
  gcn_scope_col_2_text: string;
  gcn_scope_col_3_text: string;
  qr_image_data: string;
  offset_x_mm: number;
  offset_y_mm: number;
};

const emptyForm: FormState = {
  certificate_no: '',
  certificate_issue_date: '',
  status: 'draft',
  organization_name: '',
  business_registration_no: '',
  address: '',
  business_sign_name: '',
  business_location: '',
  contract_no: '',
  effective_from: '',
  effective_to: '',
  gcn_scope_col_1_text: '',
  gcn_scope_col_2_text: '',
  gcn_scope_col_3_text: '',
  qr_image_data: '',
  offset_x_mm: 0,
  offset_y_mm: 0,
};

const toForm = (cert: CertificateRecord): FormState => ({
  certificate_no: cert.certificate_no || '',
  certificate_issue_date: cert.certificate_issue_date || '',
  status: cert.status as CertificateStatus,
  organization_name: cert.organization_name || '',
  business_registration_no: cert.business_registration_no || '',
  address: cert.address || '',
  business_sign_name: cert.business_sign_name || '',
  business_location: cert.business_location || '',
  contract_no: cert.contract_no || '',
  effective_from: cert.effective_from || '',
  effective_to: cert.effective_to || '',
  gcn_scope_col_1_text: cert.gcn_scope_col_1_text || '',
  gcn_scope_col_2_text: cert.gcn_scope_col_2_text || '',
  gcn_scope_col_3_text: cert.gcn_scope_col_3_text || '',
  qr_image_data: cert.qr_image_data || '',
  offset_x_mm: cert.offset_x_mm || 0,
  offset_y_mm: cert.offset_y_mm || 0,
});

interface InfoRowProps {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
}

function InfoRow({ label, value, mono }: InfoRowProps) {
  const display = value == null || value === '' ? '—' : String(value);
  return (
    <div className="grid gap-1 border-b border-zinc-100 py-2 text-sm sm:grid-cols-[140px_1fr]">
      <span className="text-zinc-500">{label}</span>
      <span className={`font-medium ${mono ? 'font-mono tabular-nums' : ''} ${!value ? 'text-zinc-400 italic' : 'text-zinc-900'}`}>
        {display}
      </span>
    </div>
  );
}

export function CertificateDetailPage({
  certificateId,
  onNavigate,
  onBack,
}: {
  certificateId: number;
  onNavigate: (k: RouteKey) => void;
  onBack?: () => void;
}) {
  const [record, setRecord] = useState<CertificateRecord | null>(null);
  const [printLogs, setPrintLogs] = useState<CertificatePrintLogItem[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [reprintReason, setReprintReason] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  const fetchData = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setError('Chưa đăng nhập');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [detailRes, logsRes] = await Promise.all([
        getCertificate(token, certificateId),
        getCertificatePrintLogs(token, certificateId).catch(() => ({ ok: true, certificate_id: certificateId, logs: [] })),
      ]);
      const cert = detailRes.certificate;
      const mapped: CertificateRecord = {
        id: cert.id,
        certificate_id: cert.certificate_id,
        contract_id: cert.contract_id,
        certificate_no: cert.certificate_no || null,
        certificate_issue_date: cert.certificate_issue_date || null,
        status: (cert.status === 'final_printed' ? 'final_printed' : 'draft') as CertificateStatus,
        organization_name: cert.organization_name || null,
        business_registration_no: cert.business_registration_no || null,
        address: cert.address || cert.business_location || null,
        business_sign_name: cert.business_sign_name || null,
        business_location: cert.business_location || cert.address || null,
        contract_no: cert.contract_no || '',
        effective_from: cert.effective_from || '',
        effective_to: cert.effective_to || '',
        gcn_scope_col_1_text: cert.gcn_scope_col_1_text || null,
        gcn_scope_col_2_text: cert.gcn_scope_col_2_text || null,
        gcn_scope_col_3_text: cert.gcn_scope_col_3_text || null,
        offset_x_mm: cert.offset_x_mm || 0,
        offset_y_mm: cert.offset_y_mm || 0,
        created_at: cert.created_at || '',
        printed_at: cert.printed_at,
        printed_by: cert.printed_by,
        print_count: cert.print_count || 0,
        last_printed_at: cert.last_printed_at || null,
        last_print_file: cert.last_print_file || null,
        last_print_reason: cert.last_print_reason || null,
        has_qr_image: cert.has_qr_image,
      };
      setRecord(mapped);
      setForm(toForm(mapped));
      setPrintLogs(logsRes.logs || []);
    } catch (err: any) {
      setError(String(err?.message || 'Không tải được GCN'));
    } finally {
      setLoading(false);
    }
  }, [certificateId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 4000);
  };

  const handleSave = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    setSaving(true);
    try {
      const payload: CertificateUpdatePayload = {};
      if (form.certificate_no !== record?.certificate_no) payload.certificate_no = form.certificate_no;
      if (form.certificate_issue_date !== record?.certificate_issue_date) payload.certificate_issue_date = form.certificate_issue_date;
      if (form.status !== record?.status) payload.status = form.status;
      if (form.organization_name !== record?.organization_name) payload.organization_name = form.organization_name;
      if (form.business_registration_no !== record?.business_registration_no) payload.business_registration_no = form.business_registration_no;
      if (form.address !== record?.address) payload.address = form.address;
      if (form.business_sign_name !== record?.business_sign_name) payload.business_sign_name = form.business_sign_name;
      if (form.business_location !== record?.business_location) payload.business_location = form.business_location;
      if (form.contract_no !== record?.contract_no) payload.contract_no = form.contract_no;
      if (form.effective_from !== record?.effective_from) payload.effective_from = form.effective_from;
      if (form.effective_to !== record?.effective_to) payload.effective_to = form.effective_to;
      if (form.gcn_scope_col_1_text !== record?.gcn_scope_col_1_text) payload.gcn_scope_col_1_text = form.gcn_scope_col_1_text;
      if (form.gcn_scope_col_2_text !== record?.gcn_scope_col_2_text) payload.gcn_scope_col_2_text = form.gcn_scope_col_2_text;
      if (form.gcn_scope_col_3_text !== record?.gcn_scope_col_3_text) payload.gcn_scope_col_3_text = form.gcn_scope_col_3_text;
      if (form.qr_image_data !== record?.qr_image_data) payload.qr_image_data = form.qr_image_data;
      if (form.offset_x_mm !== record?.offset_x_mm) payload.offset_x_mm = form.offset_x_mm;
      if (form.offset_y_mm !== record?.offset_y_mm) payload.offset_y_mm = form.offset_y_mm;

      const res = await updateCertificate(token, certificateId, payload);
      if (res.ok) {
        showToast('Đã lưu GCN', 'success');
        await fetchData();
      } else {
        showToast(res.errors?.join(', ') || res.message || 'Lỗi khi lưu', 'error');
      }
    } catch (err: any) {
      showToast(String(err?.message || 'Lỗi khi lưu'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    setSyncing(true);
    try {
      const res = await syncCertificate(token, certificateId);
      if (res.ok) {
        showToast(`Đã đồng bộ: ${res.synced_fields?.join(', ') || 'không có thay đổi'}`, 'success');
        await fetchData();
      } else {
        showToast(res.errors?.join(', ') || res.message || 'Lỗi khi đồng bộ', 'error');
      }
    } catch (err: any) {
      showToast(String(err?.message || 'Lỗi khi đồng bộ'), 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleAssignNumber = async (numberToAssign: string) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || !numberToAssign.trim()) return;
    setAssignLoading(true);
    try {
      const res = await assignCertificateNumber(token, certificateId, {
        certificate_no: numberToAssign.trim(),
      });
      if (res.ok) {
        setShowAssignModal(false);
        showToast(`Đã lưu số GCN: ${numberToAssign.trim()}`, 'success');
        await fetchData();
      } else {
        const errMsg = res.errors?.map(e => e.message).join('; ') || res.message;
        showToast(errMsg || 'Lỗi khi cấp số', 'error');
      }
    } catch (err: any) {
      showToast(String(err?.message || 'Lỗi khi cấp số'), 'error');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleOfficialPrint = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { showToast('Chưa đăng nhập', 'error'); return; }
    setPrintLoading(true);
    try {
      const res = await printCertificate(
        token,
        certificateId,
        record!.print_count > 0 ? reprintReason : undefined,
      );
      handlePrintResponse(res);
    } catch (err: any) {
      showToast(String(err?.message || 'Lỗi khi in chính thức'), 'error');
      setPrintLoading(false);
    }
  };

  const handlePrintResponse = (res: CertificatePrintResponse) => {
    if (res.ok) {
      setShowPrintModal(false);
      setReprintReason('');
      showToast(res.message || `Đã in chính thức (lần ${res.print_count})`, 'success');
      fetchData();
    } else {
      showToast(res.message || 'Lỗi khi in chính thức', 'error');
      setPrintLoading(false);
    }
  };

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const statusTone = form.status === 'final_printed' ? 'success' : 'neutral';

  const busy = saving || syncing;

  if (loading) {
    return (
      <Page>
        <PageHeader title="Đang tải..." description="" />
        <ContentCard>
          <div className="flex items-center justify-center py-12 text-zinc-500">
            Đang tải giấy chứng nhận...
          </div>
        </ContentCard>
      </Page>
    );
  }

  if (error || !record) {
    return (
      <Page>
        <PageHeader title="Lỗi" description={error || 'Không tìm thấy GCN'} />
        <ContentCard>
          <div className="flex items-center justify-center py-12">
            <Button variant="secondary" onClick={onBack}>Quay lại</Button>
          </div>
        </ContentCard>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        breadcrumb="/bg/contracts/certificates"
        title="Chi tiết giấy chứng nhận"
        description={record.certificate_no || `GCN #${certificateId}`}
        actions={
          <>
            <Button variant="secondary" leftIcon={<ArrowLeftIcon className="h-4 w-4" />} onClick={onBack}>
              Quay lại
            </Button>
            <Button
              variant="secondary"
              leftIcon={<RefreshCwIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />}
              onClick={handleSync}
              disabled={busy}>
              Đồng bộ từ hợp đồng
            </Button>
            <Button
              variant="secondary"
              leftIcon={<PrinterIcon className="h-4 w-4" />}
              onClick={() => {
                sessionStorage.setItem('app_pending_print_certificate_id', String(certificateId));
                sessionStorage.removeItem('app_pending_print_contract_id');
                onNavigate('contracts.print');
              }}>
              Mở trang In GCN
            </Button>
            <Button
              variant="primary"
              leftIcon={<SaveIcon className="h-4 w-4" />}
              onClick={handleSave}
              disabled={busy}>
              Lưu GCN
            </Button>
          </>
        }
      />

      {message && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${messageType === 'success' ? 'bg-lime-50 text-lime-700 ring-1 ring-lime-200' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'}`}>
          {message}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[520px_1fr]">
        <div className="space-y-5">
          {/* Info Card — GCN status + print tracking + action buttons */}
          <ContentCard title="Thông tin GCN" actions={
            <div className="flex gap-2">
              {!record.certificate_no ? (
                <Button
                  size="sm"
                  variant="primary"
                  leftIcon={<SaveIcon className="h-3.5 w-3.5" />}
                  onClick={() => setShowAssignModal(true)}
                >
                  Cấp số GCN
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  leftIcon={<PrinterIcon className="h-3.5 w-3.5" />}
                  onClick={() => setShowPrintModal(true)}
                >
                  {record.print_count > 0 ? 'In lại' : 'In chính thức'}
                </Button>
              )}
            </div>
          }>
            <div className="space-y-0">
              <InfoRow label="Số GCN" value={record.certificate_no || '—'} mono />
              <InfoRow label="Trạng thái" value={CERTIFICATE_STATUS_LABEL[record.status]} />
              <InfoRow label="Hợp đồng" value={record.contract_no} mono />
              <InfoRow label="Đơn vị" value={record.organization_name} />
              <InfoRow label="Hiệu lực từ" value={formatDate(record.effective_from)} mono />
              <InfoRow label="Hiệu lực đến" value={formatDate(record.effective_to)} mono />
              <InfoRow label="Số lần in" value={record.print_count} />
              <InfoRow label="Ngày in đầu" value={formatDate(record.printed_at)} mono />
              <InfoRow label="Ngày in cuối" value={formatDate(record.last_printed_at)} mono />
              <InfoRow label="File in cuối" value={record.last_print_file || '—'} />
            </div>
          </ContentCard>

          {/* Edit Form */}
          <ContentCard title="Khung điền giấy chứng nhận">
            <div className="space-y-5">
              {/* Số và trạng thái */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-700">Số và trạng thái</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label="Số GCN"
                    value={form.certificate_no}
                    onChange={(e) => updateField('certificate_no', e.target.value)}
                    placeholder="VD: 0137/2026.GCN_KA"
                  />
                  <Input
                    label="Ngày cấp"
                    type="date"
                    value={form.certificate_issue_date}
                    onChange={(e) => updateField('certificate_issue_date', e.target.value)}
                  />
                  <div className="sm:col-span-2">
                    <Select
                      label="Trạng thái"
                      value={form.status}
                      onChange={(v) => updateField('status', v as CertificateStatus)}
                      options={STATUS_OPTIONS}
                    />
                  </div>
                </div>
              </section>

              {/* Thông tin đơn vị */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-700">Thông tin đơn vị trên GCN</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Input
                      label="Tên đơn vị"
                      value={form.organization_name}
                      onChange={(e) => updateField('organization_name', e.target.value)}
                    />
                  </div>
                  <Input
                    label="MST/ĐKKD"
                    value={form.business_registration_no}
                    onChange={(e) => updateField('business_registration_no', e.target.value)}
                  />
                  <Input
                    label="Bảng hiệu"
                    value={form.business_sign_name}
                    onChange={(e) => updateField('business_sign_name', e.target.value)}
                  />
                  <div className="sm:col-span-2">
                    <Textarea
                      label="Địa chỉ đơn vị"
                      value={form.address}
                      onChange={(e) => updateField('address', e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Textarea
                      label="Địa điểm sử dụng"
                      value={form.business_location}
                      onChange={(e) => updateField('business_location', e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              </section>

              {/* Hiệu lực và hợp đồng */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-700">Hiệu lực và hợp đồng</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Input
                      label="Số hợp đồng"
                      value={form.contract_no}
                      onChange={(e) => updateField('contract_no', e.target.value)}
                    />
                  </div>
                  <Input
                    label="Hiệu lực từ"
                    type="date"
                    value={form.effective_from}
                    onChange={(e) => updateField('effective_from', e.target.value)}
                  />
                  <Input
                    label="Hiệu lực đến"
                    type="date"
                    value={form.effective_to}
                    onChange={(e) => updateField('effective_to', e.target.value)}
                  />
                </div>
              </section>

              {/* Phạm vi sử dụng */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-zinc-700">Phạm vi sử dụng trên GCN</h3>
                <div className="grid grid-cols-1 gap-3">
                  <Textarea
                    label="Cột 1 - Nội dung sử dụng"
                    value={form.gcn_scope_col_1_text}
                    onChange={(e) => updateField('gcn_scope_col_1_text', e.target.value)}
                    rows={4}
                    placeholder="VD: Phong 101&#10;Phong 102&#10;Phong 103"
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Textarea
                      label="Cột 2"
                      value={form.gcn_scope_col_2_text}
                      onChange={(e) => updateField('gcn_scope_col_2_text', e.target.value)}
                      rows={3}
                      placeholder="VD: 3 phong"
                    />
                    <Textarea
                      label="Cột 3"
                      value={form.gcn_scope_col_3_text}
                      onChange={(e) => updateField('gcn_scope_col_3_text', e.target.value)}
                      rows={3}
                      placeholder="VD: Karaoke&#10;(phong)"
                    />
                  </div>
                </div>
              </section>
            </div>
          </ContentCard>
        </div>
      </div>

      {/* Assign Number Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h3 className="text-base font-semibold text-zinc-900">Cấp số GCN</h3>
            <Input
              label="Số GCN"
              placeholder="VD: 0137/2026.GCN_KA"
              value={form.certificate_no}
              onChange={e => setForm(prev => ({ ...prev, certificate_no: e.target.value }))}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setShowAssignModal(false)} disabled={assignLoading}>Hủy</Button>
              <Button
                variant="primary"
                leftIcon={assignLoading ? undefined : <SaveIcon className="h-4 w-4" />}
                onClick={() => handleAssignNumber(form.certificate_no)}
                disabled={assignLoading || !form.certificate_no.trim()}
              >
                {assignLoading ? 'Đang lưu...' : 'Lưu số GCN'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Print/Reprint Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h3 className="text-base font-semibold text-zinc-900">
              {record.print_count > 0 ? 'In lại GCN' : 'In chính thức GCN'}
            </h3>
            {record.print_count > 0 && (
              <div className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                Đây là bản in lại (lần {record.print_count}). Vui lòng nhập lý do.
              </div>
            )}
            {record.print_count > 0 && (
              <Input
                label="Lý do in lại (tùy chọn)"
                placeholder="VD: Sửa lỗi in, bổ sung thông tin..."
                value={reprintReason}
                onChange={e => setReprintReason(e.target.value)}
                autoFocus
              />
            )}
            {!record.certificate_no && (
              <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                Chưa có số GCN. Vui lòng cấp số trước.
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => { setShowPrintModal(false); setReprintReason(''); }} disabled={printLoading}>Hủy</Button>
              <Button
                variant="primary"
                leftIcon={printLoading ? undefined : <PrinterIcon className="h-4 w-4" />}
                onClick={handleOfficialPrint}
                disabled={printLoading || !record.certificate_no}
              >
                {printLoading ? 'Đang in...' : (record.print_count > 0 ? 'In lại' : 'In chính thức')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
