import type { CertificateFieldLayout, CertificateQrLayout } from './certificateTypes';

// LOCKED GCN PRINT CONSTANTS - do not change without explicit user approval.
export const GCN_LOCKED_PAGE = {
  widthMm: 209.6,
  heightMm: 296.6,
  pageSize: 'A4 portrait',
  marginMm: 0,
  fontFamily: '"Times New Roman", serif',
} as const;

// LOCKED GCN PRINT CONSTANTS - do not change without explicit user approval.
export const GCN_LOCKED_OFFSET = {
  defaultXmm: 0.0,
  defaultYmm: 0.0,
  stepMm: 0.1,
  screenPreviewAppliesOffset: true,
  printModeForcesOffsetToZero: true,
} as const;

// LOCKED GCN PRINT CONSTANTS - do not change without explicit user approval.
export const GCN_TOP_BLOCK_LAYOUTS: CertificateFieldLayout[] = [
  { key: 'organization_name', x: 45, y: 62, width: 136, height: 8, fontSize: 12, align: 'left', bold: true },
  { key: 'business_registration_no', x: 80, y: 70, width: 101, height: 8, fontSize: 10.5, align: 'left' },
  { key: 'address', x: 35, y: 78, width: 146, height: 10, fontSize: 11, align: 'left' },
  { key: 'business_sign_name', x: 55, y: 86, width: 126, height: 8, fontSize: 11, align: 'left', bold: true },
  { key: 'business_location', x: 55, y: 94, width: 126, height: 10, fontSize: 11, align: 'left' },
];

// LOCKED GCN PRINT CONSTANTS - do not change without explicit user approval.
export const GCN_MID_BLOCK_LAYOUTS: CertificateFieldLayout[] = [
  { key: 'gcn_scope_col_1_text', x: 15, y: 132, width: 85, height: 72, fontSize: 11, align: 'left' },
  { key: 'gcn_scope_col_2_text', x: 112, y: 132, width: 36, height: 72, fontSize: 11, align: 'center' },
  { key: 'gcn_scope_col_3_text', x: 154, y: 132, width: 42, height: 72, fontSize: 11, align: 'center' },
];

// LOCKED GCN PRINT CONSTANTS - do not change without explicit user approval.
export const GCN_BOTTOM_ANCHOR_LAYOUTS: CertificateFieldLayout[] = [
  { key: 'contract_no', x: 105, y: 221, width: 74, height: 8, fontSize: 11, align: 'left' },
  { key: 'effective_from', x: 55, y: 230, width: 42, height: 8, fontSize: 11, align: 'left' },
  { key: 'effective_to', x: 110, y: 230, width: 30, height: 8, fontSize: 11, align: 'left' },
  { key: 'certificate_issue_day', x: 140, y: 235, width: 12, height: 8, fontSize: 11, align: 'left' },
  { key: 'certificate_issue_month', x: 161, y: 235, width: 12, height: 8, fontSize: 11, align: 'left' },
  { key: 'certificate_issue_year', x: 179, y: 235, width: 16, height: 8, fontSize: 11, align: 'left' },
  { key: 'certificate_no', x: 36, y: 274, width: 50, height: 8, fontSize: 12, align: 'left', bold: true },
];

// LOCKED GCN PRINT CONSTANTS - do not change without explicit user approval.
export const GCN_QR_LAYOUT: CertificateQrLayout = {
  x: 15,
  y: 245,
  width: 20,
  height: 20,
} as const;

