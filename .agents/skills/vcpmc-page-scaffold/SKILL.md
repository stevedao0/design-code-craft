---
name: vcpmc-page-scaffold
description: Cách dựng một trang/màn hình mới trong app VCPMC đúng kiến trúc (route, shell, dữ liệu backend, quyền, KPI, export). Dùng khi thêm trang mới hoặc tái cấu trúc trang hiện có như Báo cáo, Hợp đồng, Người dùng.
---

# VCPMC Page Scaffold

Đọc kèm skill `vcpmc-ui-design` (phần thị giác) và `vcpmc-excel-export` (phần xuất file).

## Kiến trúc

```
backend/app/api/*.py     → nguồn duy nhất tính toán & lọc & phân trang
frontend/src/lib/*Client.ts → gọi API, giữ kiểu dữ liệu
frontend/src/pages/*Page.tsx → lắp ghép, không chứa công thức tiền
frontend/src/components/<domain>/ → component riêng theo miền (reports, contract…)
frontend/src/components/app-ui/  → component dùng chung, ưu tiên tái sử dụng
frontend/src/theme/*.css → CSS theo token
```

Nguyên tắc: **backend tính — frontend trình bày**. Lọc, sắp xếp, phân trang, phân loại (bucket, trạng thái, tái ký) làm ở server để tổng số luôn khớp với số dòng hiển thị.

## Các bước dựng trang mới

1. Xác định dữ liệu: có endpoint chưa? thiếu thì bổ sung tham số lọc ở `backend/app/api/…` (ví dụ `value_filter`, `status`) thay vì lọc ở client.
2. Bổ sung kiểu vào `components/<domain>/types.ts`, hàm gọi ở `lib/<domain>Client.ts`.
3. Tạo `src/pages/XxxPage.tsx` theo khung: `Page` → `PageHeader` (tiêu đề + mô tả + nút hành động) → FilterBar dính → dải KPI → các `Section`/`ContentCard` → `DataTable`.
4. Đăng ký route trong nơi định tuyến hiện có và thêm mục vào `AppRail` nếu là trang cấp 1.
5. Quyền: ẩn/hiện số tiền theo `canViewMoney`; nhân viên chỉ thấy dữ liệu của mình, admin thấy toàn đơn vị — truyền cờ xuống cả dialog export.
6. Export: dùng dialog chọn kỳ (tuần/tháng/quý/năm) + lĩnh vực, gọi generator trong `lib/reports/`.

## Quy ước KPI

- KPI một lĩnh vực = tổng **doanh thu chưa Thuế GTGT** của các hợp đồng thuộc lĩnh vực đó, ký trong năm đang xét.
- KPI của một người = tổng KPI các lĩnh vực người đó phụ trách; luôn hiển thị được phần rã theo lĩnh vực (`KpiCompositionCard`).
- Tiến độ = Thực đạt / Mục tiêu; chỉ hiện khi có mục tiêu được giao.
- Hợp đồng chưa có giá trị = “bản soạn sẵn”, tách riêng, không tính vào doanh thu.

## Trước khi báo xong

- `cd frontend && npm run build` phải pass.
- Chụp Playwright 390 / 820 / 1440px.
- Rà: không lặp bảng/số liệu, dropdown có ý nghĩa, sắp xếp nằm ở header cột, mọi nhãn tiếng Việt và dùng “Thuế GTGT”.
