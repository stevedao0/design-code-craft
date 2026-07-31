/**
 * Thông tin định danh chính thức của VCPMC (nguồn: https://vcpmc.org).
 * Dùng cho phần letterhead / chân trang của các file xuất Excel.
 */
export const VCPMC = {
  fullName: 'TRUNG TÂM BẢO VỆ QUYỀN TÁC GIẢ ÂM NHẠC VIỆT NAM',
  shortName: 'VCPMC',
  englishName:
    'Vietnam Center for Protection of Music Copyright (VCPMC)',
  website: 'vcpmc.org',
  email: 'info@vcpmc.org',
  head: {
    label: 'Trụ sở chính',
    address:
      'Số nhà 23, ngách 2/5, ngõ 397 đường Phạm Văn Đồng, phường Xuân Đỉnh, Thành phố Hà Nội',
    phone: '(024) 3762 4718 · (024) 3762 4719',
  },
  south: {
    label: 'Chi nhánh phía Nam',
    address:
      'Số 91-93 đường số 5, khu phố số 4, phường Bình Trưng, Thành phố Hồ Chí Minh (Tòa nhà VCPMC Crescendo)',
    phone: '(028) 3829 9225 · (028) 3910 2385',
  },
} as const;

export const VCPMC_HEAD_CONTACT_LINE =
  `${VCPMC.head.label}: ${VCPMC.head.address} · ĐT: ${VCPMC.head.phone} · Email: ${VCPMC.email} · ${VCPMC.website}`;

export const VCPMC_SOUTH_CONTACT_LINE =
  `${VCPMC.south.label}: ${VCPMC.south.address} · ĐT: ${VCPMC.south.phone}`;
