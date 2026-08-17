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

### Định nghĩa KPI chính xác

- KPI được tính theo **lĩnh vực**, không tính theo user.
- KPI thực đạt (`actual`) của một lĩnh vực trong năm `Y` là tổng doanh thu
  **chưa Thuế GTGT** của **toàn bộ hợp đồng canonical** thuộc tập mã
  domain của lĩnh vực đó và có ngày ký trong năm `Y`.
- Người tạo, người nhập, người phụ trách, `owner_email`, `user_id`,
  `assignee`, người thực hiện (`nguoi_thuc_hien_email`) hay bất kỳ user
  nào đang đăng nhập **không tham gia vào điều kiện tính KPI lĩnh vực**.

Công thức tổng quát:

```text
KPI_ACTUAL(field, year)
  = SUM(normalized_revenue_before_tax của tất cả hợp đồng)
    WHERE contract.signed_year = year
      AND contract.domain_code IN FIELD_DOMAIN_MAP[field]
```

Các điều kiện **bị cấm** trong query tính KPI lĩnh vực:

```text
- owner_email
- user_id
- created_by
- assigned_to
- assignee
- người thực hiện / nguoi_thuc_hien_email
```

### Mapping lĩnh vực → domain (`FIELD_DOMAIN_MAP`)

Mỗi lĩnh vực KPI có **một tập mã domain hợp đồng** tương ứng. Mapping
này là nguồn chuẩn tập trung — backend là nơi duy nhất khai báo; frontend
và các endpoint khác chỉ resolve qua mapping.

#### Karaoke

Karaoke là **một lĩnh vực KPI duy nhất** nhưng bao gồm hai domain hợp đồng:

```text
Karaoke:
  - KARAOKE
  - PHONG_THU_AM
```

Công thức:

```text
KPI Karaoke năm Y
  = tổng doanh thu chưa Thuế GTGT của TẤT CẢ hợp đồng
    thuộc KARAOKE hoặc PHONG_THU_AM,
    có ngày ký trong năm Y.
```

`KARAOKE` và `PHONG_THU_AM` được cộng chung bằng điều kiện:

```text
domain_code IN (KARAOKE, PHONG_THU_AM)
```

Không yêu cầu một hợp đồng đồng thời mang cả hai mã. Không tách Phòng
thu âm thành một KPI riêng — trong nghiệp vụ này, Phòng thu âm thuộc lĩnh
vực KPI Karaoke.

#### Khu vui chơi

```text
Khu vui chơi:
  - KHU_VUI_CHOI
```

Công thức:

```text
KPI Khu vui chơi năm Y
  = tổng doanh thu chưa Thuế GTGT của TẤT CẢ hợp đồng
    thuộc lĩnh vực KHU_VUI_CHOI,
    có ngày ký trong năm Y.
```

#### Các lĩnh vực còn lại

Áp dụng cùng công thức:

```text
KPI lĩnh vực X năm Y
  = tổng doanh thu chưa Thuế GTGT của TẤT CẢ hợp đồng
    có domain thuộc mapping của lĩnh vực X
    và có ngày ký trong năm Y.
```

**Không tự đoán** mapping của các lĩnh vực còn lại. Mapping phải lấy từ
cấu hình/domain canonical hiện có trong project. Nếu một l�nh vực nghiệp
vụ bao gồm nhiều domain con, phải khai báo tập mã tại **một nơi duy nhất**
trong `FIELD_DOMAIN_MAP` (hiện thực hoá ở `KPI_FIELD_GROUPS` trong
`backend/app/api/kpi_field.py`).

### Vai trò của user (không tham gia công thức KPI)

- User **không phải đơn vị tính KPI**. Một user có thể được phép xem hoặc
  phụ trách 1, 2 hoặc nhiều KPI lĩnh vực. Điều đó **chỉ quyết định**
  những KPI lĩnh vực nào xuất hiện trên giao diện của user — **không
  thay đổi** cách tính hoặc giá trị của từng KPI lĩnh vực.
- Cùng field + cùng year phải có cùng `actual` ở Admin và mọi user được
  phép xem field đó.

Ví dụ: User A, User B và Admin cùng xem Karaoke trong năm 2026 đều nhận
được

```text
KPI Karaoke = tổng doanh thu KARAOKE + PHONG_THU_AM của toàn bộ hợp đồng
              ký trong năm 2026.
```

Nếu một user được giao hai lĩnh vực thì

```text
Tổng KPI hiển thị của user
  = KPI toàn lĩnh vực thứ nhất
  + KPI toàn lĩnh vực thứ hai
```

nhưng từng KPI thành phần vẫn được tính trên **toàn bộ hợp đồng của
lĩnh vực**, không lọc theo user.

### Phân biệt actual và target

- KPI thực đạt (`actual`) và chỉ tiêu KPI (`target`) là **hai dữ liệu
  khác nhau**, không thay thế cho nhau.
- `actual` được tính từ doanh thu chưa Thuế GTGT của toàn bộ hợp đồng
  thuộc lĩnh vực, theo công thức ở mục "Định nghĩa KPI chính xác".
- `target` lấy từ **cấu hình chỉ tiêu đã được phê duyệt** của lĩnh vực /
  năm (hiện lưu ở `kpi_field_assignments.target_amount` cho user; với
  phạm vi tổ chức thì lấy từ cấu hình target riêng của từng lĩnh vực —
  không lấy từ tổng hợp user assignment).
- Không dùng `target` để thay `actual`. Không dùng `actual` để tự sinh
  `target`. Không cộng mọi `target` đang active rồi mặc định đó là
  `target` của một user.
- Tiến độ:

  ```text
  progress = actual / target
  ```

  Chỉ hiển thị khi có `target` hợp lệ; nếu không có `target` thì hiển
  thị `—` chứ không phải `0%`.

### Doanh thu và hợp đồng thiếu dữ liệu

- Dùng resolver chuẩn hoá doanh thu backend
  (`services.revenue_resolver.normalize_contract_revenue`) là nguồn duy
  nhất cho giá trị tiền trong KPI.
- Cơ sở KPI là **tiền trước Thuế GTGT** (`before_vat`). Không tự suy
  diễn `before_vat` từ giá trị legacy sau Thuế GTGT khi thiếu dữ liệu
  cần thiết.
- Hợp đồng chưa xác định được tiền (`unresolved`) vẫn thuộc **số lượng
  hợp đồng** của lĩnh vực, nhưng **không được cộng số tiền giả** vào
  `actual`. Phải báo riêng `valued_contract_count` (có giá trị) và
  `unresolved_value_count` (chưa giải quyết được giá trị).
- Không đếm trùng một hợp đồng khi mapping có alias — một hợp đồng chỉ
  góp vào tổng `actual` của đúng lĩnh vực chứa nó, dù alias / domain
  mapping có thể khiến nó khớp nhiều biến thể.

### Quy tắc nghiệp vụ bắt buộc (không được suy diễn)

- KPI của một user = tổng `actual` của **đúng các lĩnh vực** mà user đó
  được phép xem / phụ trách theo cấu hình. "Lĩnh vực được giao" phải có
  bản ghi cấu hình thật (`kpi_field_assignments` cho user; mapping riêng
  cho phạm vi tổ chức). Không suy ra từ `target` đang active, từ hợp
  đồng user đó đã thực hiện, từ danh sách member fields trong
  `KPI_FIELD_GROUPS`, hoặc từ bất kỳ fallback "org-wide" nào khác.
- KPI của một lĩnh vực = tổng doanh thu **chưa Thuế GTGT** của toàn bộ
  hợp đồng thuộc tập domain của lĩnh vực đó, ký trong năm đang xét,
  **không lọc theo nhân viên thực hiện** và không lọc theo bất kỳ user
  nào (xem mục "Định nghĩa KPI chính xác" ở trên).
- Một user có thể được giao 1, 2 hoặc nhiều lĩnh vực. Lĩnh vực được
  giao đến từ cấu hình `kpi_field_assignments` (lưu theo `user_id`),
  **KHÔNG** suy ra từ hợp đồng user đó đã thực hiện.
- Lĩnh vực KPI "Karaoke" bao gồm `KARAOKE` và `PHONG_THU_AM` trong
  cùng một field (xem mục "Mapping lĩnh vực → domain").
- Khi user được giao nhiều lĩnh vực, tổng KPI = tổng `actual` các lĩnh
  vực (không trừ trùng hợp đồng alias / domain mapping).
- User **không được giao lĩnh vực nào** ⇒ nhận empty state đúng, không
  nhận KPI tổ chức.
- Staff không được phép truyền `user_email` của người khác vào
  `/api/kpi/field-kpi` (403). Admin / Manager có permission phù hợp mới
  xem được KPI người khác.
- Danh sách hợp đồng và các chức năng nghiệp vụ của Staff vẫn tuân theo
  quyền và phạm vi dữ liệu cá nhân. Riêng KPI lĩnh vực là ngoại lệ
  nghiệp vụ: Staff được xem **số tổng hợp** của toàn bộ hợp đồng thuộc
  các lĩnh vực KPI được giao, nhưng không vì vậy mà được xem danh sách
  hay chi tiết hợp đồng của người khác nếu không có quyền.
- Quyền xem chi tiết / danh sách hợp đồng là vấn đề khác với aggregation
  KPI lĩnh vực — không xáo trộn hai phạm vi này.

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

## Trực quan KPI: Admin và Staff dùng chung component

- Admin Ring (`OrgFieldRings`, `MultiRingKpi` trong `KpiFieldSection`) và
  Staff Ring (`MultiRingKpi` trong `ReportsPage.StaffOverviewTab`) phải
  dùng **chung component**, cùng bento, tile, màu, khoảng cách,
  typography, responsive. Chỉ khác dataset theo quyền:

  - Admin: tất cả lĩnh vực KPI tổ chức (`field-kpi-org`).
  - Staff: chỉ các lĩnh vực có **assignment thật** (`field-kpi` user scope).

- Cùng `(field, year)` phải render cùng giá trị actual, cùng target,
  cùng số hợp đồng, cùng tiến độ, cùng màu.
- Staff **không** được thấy nút quản lý / giao KPI nếu không có permission.
- Nếu Staff không có assignment → hiện `ReportEmpty` thay vì Ring rỗng.
- Ring nhỏ chỉ hiển thị "N lĩnh vực KPI" là sai bố cục — Ring phải là
  Ring tiến độ như Admin: phần trăm hoàn thành chung + tiến độ từng
  lĩnh vực.

## Trước khi báo xong

- `cd frontend && npm run build` phải pass.
- Chụp Playwright 390 / 820 / 1440px.
- Rà: không lặp bảng/số liệu, dropdown có ý nghĩa, sắp xếp nằm ở header cột, mọi nhãn tiếng Việt và dùng “Thuế GTGT”.
