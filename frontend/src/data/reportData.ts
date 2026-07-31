/**
 * Reports data — field category mapping helpers.
 *
 * IMPORTANT: All real data is fetched from /api/reports/summary endpoint.
 * This file only contains:
 *   - Type definitions for UI field categories (canonical labels used in UI)
 *   - Helper functions for field category mapping
 *   - Canonical field category definitions
 *
 * No hardcoded mock/clone data here.
 *
 * NOTE: Shared types (ReportsSummary, RevenueYearItem, etc.) are imported from
 * reportsTypes.ts to avoid circular import chains.
 */
import type { ReportsSummary } from '../lib/reportsTypes';

// =============================================================================
// Field categories (canonical labels used in UI)
// Mirrors backend CANONICAL_FIELD_LABELS mapping
// =============================================================================

export type FieldCategoryKey =
  | 'karaoke'
  | 'phong_thu_am'
  | 'cafe'
  | 'nha_hang'
  | 'khach_san'
  | 'khu_vui_choi'
  | 'tttm'
  | 'bar'
  | 'van_phong'
  | 'cua_hang'
  | 'rap_phim'
  | 'phong_tra'
  | 'cssk'
  | 'sieu_thi'
  | 'bieu_dien';

export type FieldCategory = {
  key: FieldCategoryKey;
  label: string;
  description: string;
  rawMatches: string[];
};

// Canonical field categories shown in UI.
// Each maps to one or more raw DB values.
export const FIELD_CATEGORIES: FieldCategory[] = [
  {
    key: 'karaoke',
    label: 'Karaoke',
    description: 'Cơ sở có giấy phép phòng karaoke đạt chuẩn.',
    rawMatches: ['Karaoke', 'KARAOKE', 'karaoke'],
  },
  {
    key: 'phong_thu_am',
    label: 'Phòng thu âm',
    description:
      'Cơ sở không thuộc điều kiện phân loại Karaoke, ghi nhận theo nhóm phòng thu âm.',
    rawMatches: ['Phòng thu âm', 'Phòng Thu Âm', 'PTA', 'Phòng ghi âm'],
  },
  {
    key: 'cafe',
    label: 'Cà phê',
    description: 'Quán cà phê.',
    rawMatches: ['Cà phê', 'Cafe', 'Coffee', 'cafe'],
  },
  {
    key: 'nha_hang',
    label: 'Nhà hàng',
    description: 'Nhà hàng ăn uống.',
    rawMatches: ['Nhà hàng', 'restaurant'],
  },
  {
    key: 'khach_san',
    label: 'Khách sạn',
    description: 'Khách sạn lưu trú.',
    rawMatches: ['Khách sạn', 'Hotel', 'hotel'],
  },
  {
    key: 'khu_vui_choi',
    label: 'Khu vui chơi',
    description: 'Khu vui chơi giải trí.',
    rawMatches: ['Khu vui chơi', 'Khu vui chơi giải trí', 'entertainment'],
  },
  {
    key: 'tttm',
    label: 'Trung tâm thương mại',
    description: 'Trung tâm thương mại / Mall.',
    rawMatches: ['Trung tâm thương mại', 'TTTM', 'Mall', 'shopping_mall'],
  },
  {
    key: 'bar',
    label: 'Bar',
    description: 'Bar / Lounge / Club.',
    rawMatches: ['Bar', 'Lounge', 'Club'],
  },
  {
    key: 'van_phong',
    label: 'Văn phòng',
    description: 'Văn phòng làm việc.',
    rawMatches: ['Văn phòng', 'Office'],
  },
  {
    key: 'cua_hang',
    label: 'Cửa hàng',
    description: 'Cửa hàng bán lẻ.',
    rawMatches: ['Cửa hàng', 'Store', 'Shop'],
  },
  {
    key: 'rap_phim',
    label: 'Rạp phim',
    description: 'Rạp chiếu phim.',
    rawMatches: ['Rạp phim', 'Cinema'],
  },
  {
    key: 'phong_tra',
    label: 'Phòng trà',
    description: 'Phòng trà / Acoustic.',
    rawMatches: ['Phòng trà', 'Acoustic', 'Tea room'],
  },
  {
    key: 'cssk',
    label: 'Chăm sóc sức khỏe',
    description: 'Spa / Gym / Fitness.',
    rawMatches: ['Chăm sóc sức khỏe', 'Spa', 'Gym', 'Fitness'],
  },
  {
    key: 'sieu_thi',
    label: 'Siêu thị',
    description: 'Siêu thị / Supermarket.',
    rawMatches: ['Siêu thị', 'Supermarket'],
  },
  {
    key: 'bieu_dien',
    label: 'Biểu diễn',
    description: 'Sự kiện biểu diễn / Performance.',
    rawMatches: ['Biểu diễn', 'Performance', 'Event'],
  },
];

// Reverse-lookup: raw DB value -> canonical category
const RAW_TO_CATEGORY: Record<string, FieldCategoryKey> = (() => {
  const map: Record<string, FieldCategoryKey> = {};
  for (const cat of FIELD_CATEGORIES) {
    for (const raw of cat.rawMatches) {
      map[raw.toLowerCase()] = cat.key;
    }
  }
  return map;
})();

/**
 * Map a raw DB linh_vuc_hien_thi value to a canonical category key.
 * Returns null if no mapping found.
 */
export function mapRawFieldToCategory(
  raw: string | null | undefined
): FieldCategoryKey | null {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  // "Phòng ghi âm" is dirty legacy data — excluded from mapping
  if (key === 'phòng ghi âm') return null;
  return RAW_TO_CATEGORY[key] ?? null;
}

// Re-export shared types from reportsTypes
export type { RevenueYearItem, FieldCategoryCount } from '../lib/reportsTypes';
