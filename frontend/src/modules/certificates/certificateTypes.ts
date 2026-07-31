export type CertificatePrintMode = 'screen' | 'print';

export type CertificateAlign = 'left' | 'center' | 'right';

export type CertificateFieldKey =
  | 'organization_name'
  | 'business_registration_no'
  | 'address'
  | 'business_sign_name'
  | 'business_location'
  | 'gcn_scope_col_1_text'
  | 'gcn_scope_col_2_text'
  | 'gcn_scope_col_3_text'
  | 'contract_no'
  | 'effective_from'
  | 'effective_to'
  | 'certificate_issue_day'
  | 'certificate_issue_month'
  | 'certificate_issue_year'
  | 'certificate_no';

export type CertificateFieldLayout = {
  key: CertificateFieldKey;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  align: CertificateAlign;
  bold?: boolean;
};

export type CertificateQrLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CertificatePreviewData = {
  certificate_no: string;
  certificate_issue_date?: string;
  certificate_issue_day?: string;
  certificate_issue_month?: string;
  certificate_issue_year?: string;
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
  qr_image_data?: string;
  offset_x_mm?: number;
  offset_y_mm?: number;
  /** Per-field pixel offsets keyed by field key (e.g. "gcn_scope_col_1_text") */
  fieldOffsets?: Record<string, { dx: number; dy: number }>;
  /** Text alignment overrides for scope columns */
  scopeColAlign?: {
    col1?: CertificateAlign;
    col2?: CertificateAlign;
    col3?: CertificateAlign;
  };
};

export type FieldTypographyConfig = {
  fontSizePt?: number;
  bold?: boolean;
};

/** Per-field typography overrides keyed by field key (e.g. "organization_name") */
export type CertificateTypographyOverrides = Partial<Record<string, FieldTypographyConfig>>;

export type CalibrationMode = 'off' | 'on';

/** Screen-only preview zoom mode. Does not affect print output. */
export type GcnPreviewZoomMode = 'fit-height' | 'fit-width' | 'actual-100' | 'custom';

export type GcnPreviewZoomState = {
  mode: GcnPreviewZoomMode;
  /** 0.25..2.0 — used when mode === 'custom' */
  scale: number;
};

export type CalibrationProfileLike = {
  id: string;
  name: string;
  paperType: string;
  templateType: string;
  offsetXmm: number;
  offsetYmm: number;
};

