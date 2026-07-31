/**
 * Certificate record types — mirrors backend CertificateRecordRow model.
 *
 * Workflow: Chưa cấp số → Đã cấp số → In chính thức → In lại (nếu cần)
 * No test print workflow.
 */
export type CertificateStatus = 'draft' | 'test_printed' | 'final_printed';

export type CertificateRecord = {
  id: number;
  certificate_id?: number;
  contract_id?: number;
  certificate_no: string | null;
  certificate_issue_date?: string | null;
  status: CertificateStatus;
  organization_name: string;
  business_registration_no?: string | null;
  business_sign_name: string | null;
  business_location?: string | null;
  address: string;
  contract_no: string;
  effective_from: string;
  effective_to: string;
  gcn_scope_col_1_text?: string | null;
  gcn_scope_col_2_text?: string | null;
  gcn_scope_col_3_text?: string | null;
  qr_image_data?: string | null;
  offset_x_mm?: number;
  offset_y_mm?: number;
  created_at: string;
  printed_at: string | null;
  printed_by?: string | null;
  print_count: number;
  last_printed_at?: string | null;
  last_print_file?: string | null;
  last_print_reason?: string | null;
  has_qr_image?: boolean;
};

export const CERTIFICATE_STATUS_LABEL: Record<CertificateStatus, string> = {
  draft: 'Chưa cấp số',
  test_printed: 'Đã in',
  final_printed: 'Đã in chính thức',
};

export const CERTIFICATE_STATUS_TONE: Record<
  CertificateStatus,
  'neutral' | 'warning' | 'success'
> = {
  draft: 'neutral',
  test_printed: 'warning',
  final_printed: 'success',
};
