export const DOMAINS = [
{ id: 'background', label: 'Background', accent: 'indigo' },
{ id: 'karaoke', label: 'Karaoke', accent: 'amber' },
{ id: 'phong_thu_am', label: 'Phòng thu âm', accent: 'violet' },
{ id: 'ca_phe', label: 'Cà phê', accent: 'emerald' },
{ id: 'nha_hang', label: 'Nhà hàng', accent: 'rose' },
{ id: 'khach_san', label: 'Khách sạn', accent: 'cyan' },
{ id: 'khu_vui_choi', label: 'Khu vui chơi', accent: 'fuchsia' },
{ id: 'tttm', label: 'Trung tâm thương mại', accent: 'blue' },
{ id: 'bar', label: 'Bar', accent: 'purple' },
{ id: 'van_phong', label: 'Văn phòng', accent: 'slate' },
{ id: 'cua_hang', label: 'Cửa hàng', accent: 'teal' },
{ id: 'rap_phim', label: 'Rạp phim', accent: 'red' },
{ id: 'phong_tra', label: 'Phòng trà', accent: 'orange' },
{ id: 'cssk', label: 'Chăm sóc sức khỏe', accent: 'pink' },
{ id: 'sieu_thi', label: 'Siêu thị', accent: 'sky' },
{ id: 'bieu_dien', label: 'Biểu diễn', accent: 'yellow' },
{ id: 'media_sctt', label: 'Media/SCTT', accent: 'zinc', adminOnly: true }];


export const ROLE_DEFS = {
  super_admin: {
    id: 'super_admin',
    name: 'Super Admin',
    description: 'Toàn quyền hệ thống.',
    permissions: [
    'portal.access',
    'contracts.read',
    'contracts.create',
    'contracts.update',
    'contracts.delete',
    'annexes.read',
    'annexes.create',
    'annexes.update',
    'annexes.delete',
    'catalogue.upload',
    'works.read',
    'works.import',
    'reports.view',
    'reports.export',
    'admin.users.manage',
    'admin.system.manage',
    'admin.ops.view',
    'admin.data.manage',
    'youtube.cookies.manage']

  },
  manager: {
    id: 'manager',
    name: 'Manager',
    description: 'Quản lý nghiệp vụ, xem báo cáo và xử lý hợp đồng/GCN.',
    permissions: [
    'portal.access',
    'contracts.read',
    'contracts.create',
    'contracts.update',
    'contracts.delete',
    'annexes.read',
    'annexes.create',
    'annexes.update',
    'annexes.delete',
    'catalogue.upload',
    'works.read',
    'works.import',
    'reports.view',
    'reports.export',
    'admin.users.manage',
    'admin.data.manage',
    'youtube.cookies.manage']

  },
  staff: {
    id: 'staff',
    name: 'Staff',
    description:
    'Nhân viên nhập liệu và xử lý hợp đồng trong domain được phân quyền.',
    permissions: [
    'portal.access',
    'contracts.read',
    'contracts.create',
    'annexes.read',
    'catalogue.upload',
    'works.read',
    'works.import',
    'reports.view',
    'admin.users.manage',
    'youtube.cookies.manage']

  }
};

export const MOCK_USERS = [
{
  id: 'u1',
  email: 'admin@vcpmc.org',
  password: 'admin123',
  name: 'Admin',
  role: 'super_admin',
  domains: ['__all__'],
  status: 'active',
  lastLogin: '2026-05-08 08:30',
  contractsHandled: 42,
  certificatesHandled: 655,
  avatarInitial: 'A'
},
{
  id: 'u2',
  email: 'tuan@vcpmc.org',
  password: 'tuan123',
  name: 'Tuấn',
  role: 'manager',
  domains: ['background', 'karaoke', 'phong_thu_am'],
  status: 'active',
  lastLogin: '2026-05-08 09:10',
  contractsHandled: 42,
  certificatesHandled: 32,
  avatarInitial: 'T'
},
{
  id: 'u3',
  email: 'user1@vcpmc.org',
  password: 'user123',
  name: 'Nhân viên 1',
  role: 'staff',
  domains: ['karaoke'],
  status: 'active',
  lastLogin: '2026-05-07 17:45',
  contractsHandled: 14,
  certificatesHandled: 11,
  avatarInitial: 'N'
},
{
  id: 'u4',
  email: 'locked@vcpmc.org',
  password: 'locked123',
  name: 'Nhân viên tạm khóa',
  role: 'staff',
  domains: ['karaoke'],
  status: 'locked',
  lastLogin: '2026-04-28 11:00',
  contractsHandled: 3,
  certificatesHandled: 0,
  avatarInitial: 'L'
}];


export const AUDIT_LOG = [
{
  id: 'a1',
  timestamp: '2026-05-08 09:15',
  actor: 'Admin',
  actorEmail: 'admin@vcpmc.org',
  type: 'permission',
  action: 'Cập nhật quyền',
  target: 'Manager',
  description: 'Admin cập nhật quyền Manager'
},
{
  id: 'a2',
  timestamp: '2026-05-08 09:12',
  actor: 'Tuấn',
  actorEmail: 'tuan@vcpmc.org',
  type: 'contract',
  action: 'Tạo hợp đồng',
  target: '0645/2026/HĐQTGAN-PN/PR',
  description: 'Tuấn tạo hợp đồng 0645/2026/HĐQTGAN-PN/PR'
},
{
  id: 'a3',
  timestamp: '2026-05-08 08:45',
  actor: 'Nhân viên 1',
  actorEmail: 'user1@vcpmc.org',
  type: 'certificate',
  action: 'Cập nhật GCN',
  target: '0284/2026.GCN_KA',
  description: 'Nhân viên 1 cập nhật GCN 0284/2026.GCN_KA'
},
{
  id: 'a4',
  timestamp: '2026-05-07 18:00',
  actor: 'Admin',
  actorEmail: 'admin@vcpmc.org',
  type: 'security',
  action: 'Khóa tài khoản',
  target: 'locked@vcpmc.org',
  description: 'Admin khóa tài khoản locked@vcpmc.org'
},
{
  id: 'a5',
  timestamp: '2026-05-07 17:45',
  actor: 'Nhân viên 1',
  actorEmail: 'user1@vcpmc.org',
  type: 'login',
  action: 'Đăng nhập',
  description: 'Đăng nhập thành công'
},
{
  id: 'a6',
  timestamp: '2026-05-07 10:20',
  actor: 'Tuấn',
  actorEmail: 'tuan@vcpmc.org',
  type: 'contract',
  action: 'Xuất báo cáo',
  target: 'Hợp đồng đã ký',
  description: 'Tuấn xuất báo cáo hợp đồng đã ký tháng 5'
}];