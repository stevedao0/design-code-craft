export type EnterpriseTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'teal'
  | 'violet';

export const enterpriseToneClassMap: Record<EnterpriseTone, string> = {
  neutral: 'vc-enterprise-tone-neutral',
  accent: 'vc-enterprise-tone-accent',
  success: 'vc-enterprise-tone-success',
  warning: 'vc-enterprise-tone-warning',
  danger: 'vc-enterprise-tone-danger',
  info: 'vc-enterprise-tone-info',
  teal: 'vc-enterprise-tone-teal',
  violet: 'vc-enterprise-tone-violet',
};

export function enterpriseCx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}
