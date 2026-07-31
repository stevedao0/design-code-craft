/**
 * Frontend role helpers.
 *
 * Backend `FULL_ACCESS_ROLES = {"admin", "mod", "moderator", "superuser"}`
 * is mirrored here for UI gating. Backend is still authoritative — these
 * flags only decide whether to render the pickable owner dropdown.
 */
export const FRONTEND_FULL_ACCESS_ROLES = new Set<string>([
  'admin',
  'mod',
  'moderator',
  'superuser',
]);

export type FrontendUserShape = {
  role?: string | null;
  username?: string | null;
  email?: string | null;
  name?: string | null;
};

export function isFullAccessUser(user: FrontendUserShape | null | undefined): boolean {
  if (!user) return false;
  const role = String(user.role || '').trim().toLowerCase();
  return FRONTEND_FULL_ACCESS_ROLES.has(role);
}
