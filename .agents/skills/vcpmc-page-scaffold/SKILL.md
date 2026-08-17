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

### Quy tắc nghiệp vụ bắt buộc (không được suy diễn)

- KPI của một user **KHÔNG ĐƯỢC** tính theo `user_id`, `owner_email`, người tạo hợp đồng
  hoặc người thực hiện hợp đồng (`nguoi_thuc_hien_email`).
- KPI của một user = tổng KPI của **tất cả lĩnh vực được giao** cho user đó.
- KPI của một lĩnh vực = tổng doanh thu **chưa Thuế GTGT** của toàn bộ hợp đồng
  thuộc các mã miền được bao gồm trong lĩnh vực đó, ký trong năm đang xét, **không
  lọc theo nhân viên thực hiện**.
- Một user có thể được giao 1, 2 hoặc nhiều lĩnh vực. Lĩnh vực được giao đến từ
  `kpi_field_assignments` (lưu theo `user_id`), KHÔNG suy ra từ hợp đồng user đó
  đã thực hiện.
- Lĩnh vực KPI "Karaoke" bao gồm tối thiểu `KARAOKE` và `PHONG_THU_AM`. Khi user
  được giao lĩnh vực Karaoke, KPI phải cộng toàn bộ hợp đồng của cả hai mã miền
  trong năm, không phụ thuộc hợp đồng đó thuộc user nào.
- Khi user được giao nhiều lĩnh vực, tổng KPI = tổng KPI các lĩnh vực (KHÔNG
  trừ trùng hợp đồng alias/domain mapping).
- User **không được giao lĩnh vực nào** ⇒ nhận empty state đúng, không nhận KPI
  tổ chức.
- Staff không được phép truyền `user_email` của người khác vào `/api/kpi/field-kpi`
  (403). Admin / Manager có permission phù hợp mới xem được KPI người khác.
- Danh sách hợp đồng và các chức năng nghiệp vụ của Staff vẫn tuân theo quyền
  và phạm vi dữ liệu cá nhân. Riêng KPI lĩnh vực là ngoại lệ nghiệp vụ: Staff
  được xem số tổng hợp của toàn bộ hợp đồng thuộc các lĩnh vực KPI được giao,
  nhưng không vì vậy mà được xem danh sách hay chi tiết hợp đồng của người khác
  nếu không có quyền.

### Ranh giới phạm vi (bắt buộc)

| Chức năng | Phạm vi Staff |
| --- | --- |
| KPI lĩnh vực | Toàn bộ hợp đồng thuộc **lĩnh vực được giao** |
| Ring KPI | Toàn bộ hợp đồng thuộc **lĩnh vực được giao** |
| Tổng quan KPI | Tổng các **lĩnh vực được giao** |
| Hợp đồng của tôi | Theo quyền / ownership / assignment hiện hành |
| Search và bảng hợp đồng | Không được lộ hợp đồng người khác |
| Export danh sách hợp đồng | Theo quyền dữ liệu cá nhân |
| Export KPI tổng hợp | Chỉ số tổng hợp của lĩnh vực được giao, không kèm chi tiết ngoài quyền |

Không dùng cùng một query ownership cho cả KPI và "Hợp đồng của tôi".

### Nhóm hợp nhất (canonical group)

`KPI_FIELD_GROUPS` ở `backend/app/api/kpi_field.py` là nguồn chuẩn tập trung
cho việc map **lĩnh vực được giao** ↔ **các mã miền canonical** của hợp đồng.
Frontend và các endpoint khác **không** tự rải điều kiện string matching ở nhiều
nơi; phải resolve qua mapping này.

### Cơ sở tiền

- KPI dùng resolver chuẩn hóa `services.revenue_resolver.normalize_contract_revenue`
  (BEFORE_VAT): `royalty_amount_before_vat` khi dương, suy ra từ
  `royalty_amount_after_vat - vat_amount` khi cả hai dương, ngược lại record là
  `unresolved` và KHÔNG tính vào KPI.
- Hợp đồng legacy chỉ có `so_tien_value` (legacy mapping stores after-VAT) là
  `unresolved` đối với KPI BEFORE_VAT — không tự suy diễn.
- Không đổi lại sang `KPI_SIGNED` cho KPI lĩnh vực; ring/bento luôn dùng
  BEFORE_VAT.

### Nhãn nghiệp vụ chuẩn

- Card tổng: "Thực đạt KPI lĩnh vực".
- Target: "Tổng mục tiêu các lĩnh vực được giao".
- Danh sách: "Lĩnh vực được giao" (hoặc "KPI của tôi" / "KPI các lĩnh vực phụ
  trách", kèm mô tả "Tổng doanh thu chưa Thuế GTGT của toàn bộ hợp đồng thuộc
  các lĩnh vực được giao, không lọc theo người thực hiện").
- Với Karaoke hiển thị một dòng, kèm ghi chú nhỏ: "Bao gồm: Karaoke, Phòng thu âm".

## Trước khi báo xong

- `cd frontend && npm run build` phải pass.
- Chụp Playwright 390 / 820 / 1440px.
- Rà: không lặp bảng/số liệu, dropdown có ý nghĩa, sắp xếp nằm ở header cột, mọi nhãn tiếng Việt và dùng “Thuế GTGT”.
