export const PERMISSION_GROUPS = [
{
  key: 'dashboard',
  label: 'Dashboard',
  permissions: [{ key: 'dashboard.view', label: 'Xem Dashboard' }]
},
{
  key: 'contracts',
  label: 'Hợp đồng',
  permissions: [
  { key: 'contracts.view', label: 'Xem danh sách hợp đồng' },
  { key: 'contracts.create', label: 'Tạo hợp đồng mới' },
  { key: 'contracts.edit', label: 'Chỉnh sửa hợp đồng' },
  { key: 'contracts.delete', label: 'Xóa hợp đồng' },
  { key: 'contracts.export', label: 'Xuất dữ liệu hợp đồng' }]

},
{
  key: 'certificates',
  label: 'GCN',
  permissions: [
  { key: 'certificates.view', label: 'Xem danh sách GCN' },
  { key: 'certificates.create', label: 'Tạo GCN' },
  { key: 'certificates.print_test', label: 'In thử GCN' },
  { key: 'certificates.print_final', label: 'In chính thức GCN' }]

},
{
  key: 'reports',
  label: 'Báo cáo',
  permissions: [
  { key: 'reports.view', label: 'Xem báo cáo' },
  { key: 'reports.view_contract_value', label: 'Xem chi tiết tiền từng hợp đồng trong báo cáo' },
  { key: 'reports.view_branch', label: 'Xem báo cáo toàn chi nhánh' },
  { key: 'kpi.manage', label: 'Quản lý KPI lĩnh vực' },
  { key: 'reports.export', label: 'Xuất báo cáo' }]

},
{
  key: 'search',
  label: 'Tìm kiếm',
  permissions: [{ key: 'search.view', label: 'Sử dụng tìm kiếm toàn cục' }]
},
{
  key: 'admin',
  label: 'Admin',
  permissions: [
  { key: 'admin.users.view', label: 'Xem danh sách người dùng' },
  { key: 'admin.users.create', label: 'Tạo người dùng' },
  { key: 'admin.users.edit', label: 'Chỉnh sửa người dùng' },
  { key: 'admin.roles.view', label: 'Xem phân quyền' },
  { key: 'admin.roles.edit', label: 'Chỉnh sửa phân quyền' }]

},
{
  key: 'ai',
  label: 'AI Assistant',
  permissions: [{ key: 'ai.view', label: 'Sử dụng AI Assistant' }]
},
{
  key: 'settings',
  label: 'Settings',
  permissions: [{ key: 'settings.view', label: 'Xem cài đặt hệ thống' }]
}];