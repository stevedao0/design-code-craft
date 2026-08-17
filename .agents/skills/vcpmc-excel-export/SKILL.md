---
name: vcpmc-excel-export
description: Chuẩn thiết kế và sinh file Excel/Word xuất ra từ app VCPMC (bảng tính tiền bản quyền, báo cáo hợp đồng) bằng ExcelJS. Dùng khi tạo mới hoặc sửa bất kỳ chức năng export nào.
---

# VCPMC Excel Export

Mọi file xuất ra là **văn bản đối ngoại của VCPMC** — phải đẹp, dễ in, đồng bộ với giao diện app.

## Ràng buộc pháp lý & số liệu (không được vi phạm)

- **Không tự sáng tạo công thức**, không tính lại tiền trong file generator. Số tiền lấy nguyên từ backend/snapshot; phần cộng dồn dùng công thức Excel `SUM(...)` để file còn “sống”.
- **Không hardcode số tiền.** MLCS (mức lương cơ sở) = **2.530.000đ** theo NĐ 161/2026, biểu phí theo **NĐ 17/2023**; đưa vào ô Excel có tên (`MLCS`, `THUEGTGT`) để công thức tham chiếu.
- Luôn viết **“Thuế GTGT”**, tuyệt đối không “VAT”.
- Nhãn tổng: “Cộng tiền bản quyền”, “Thuế GTGT 8%”, “Tổng cộng”, “Bằng chữ”.

## Quy tắc khi xuất KPI

- File xuất KPI phải dùng số liệu lĩnh vực từ **backend** (resolver +
  endpoint KPI). Generator **không tính lại KPI theo user** trong file.
- `Karaoke` trong báo cáo phải phản ánh tổng `KARAOKE + PHONG_THU_AM`
  đúng như backend đã gộp; không tách Phòng thu âm thành dòng riêng.
- Tên lĩnh vực và mapping domain phải đồng nhất với báo cáo trên UI và
  với `FIELD_DOMAIN_MAP` (xem skill `vcpmc-page-scaffold`).
- Không suy ra target từ actual, không cộng mọi target active thành
  target của một user. Target trong file xuất lấy từ cấu hình đã
  được phê duyệt của lĩnh vực / năm, đúng cùng nguồn với API.
- Nếu lĩnh vực không có target hợp lệ, cột “Tiến độ” để trống / `—`,
  không hiển thị `0%`.

## Theme dùng chung

`frontend/src/lib/reports/workbookTheme.ts` giữ toàn bộ token ARGB + helper (`WB`, `WB_FONT`, `WB_FMT`, `wbStyle`, `wbBox`, `wbBarText`, `wbPageSetup`, `wbToneColors`, `wbSafeName`).
Không tự định nghĩa màu/định dạng mới trong từng generator — thêm vào theme rồi dùng lại.

- Font: **Times New Roman** (văn bản hành chính VN).
- Xanh thương hiệu `#4A7202` cho header bảng và tiêu đề; dải zebra xanh nhạt; cam/đỏ cho cảnh báo & quá hạn (đúng nghĩa như trên UI).
- Định dạng tiền `#,##0`, phần trăm `0.0%`, số nguyên `#,##0`.

## Bố cục file chuẩn

1. **Letterhead**: tên đầy đủ VCPMC + 2 dòng liên hệ (`src/lib/calculations/vcpmcIdentity.ts`), đường kẻ xanh, tiêu đề in hoa, dòng kỳ báo cáo/phạm vi, ngày xuất.
2. **Dải thẻ KPI (StatTile)**: nhãn nhỏ in hoa xám + số lớn + dòng chú thích, nền xanh nhạt cho thẻ trọng yếu.
3. **Bảng dữ liệu**: header xanh chữ trắng, zebra, viền mảnh, freeze header, `autoFilter`, dòng “CỘNG” dùng `SUM`.
4. **Trực quan hoá**: `addConditionalFormatting` dataBar cho cột giá trị + thanh ký tự `wbBarText()` cho tỷ trọng.
5. **Ghi chú cuối**: nguồn số liệu, cách xử lý hợp đồng chưa có doanh thu.
6. **Footer in ấn**: tên đơn vị · email/website · “Trang &P/&N”; đặt `printArea`, `printTitlesRow`.

Tối thiểu phải có **sheet Tổng hợp + sheet Chi tiết**; báo cáo hợp đồng dùng 4 sheet: `Tổng hợp` · `Danh sách hợp đồng` · `Phân loại & tái ký` · `Chưa có doanh thu`.
Bản xuất từ Fab tính nhanh **không** kèm khối ký tên; bản hợp đồng chính thức thì có “TM. VCPMC”.

## Kiểm thử bắt buộc

Sau khi sửa generator:

```bash
cd frontend && npm run build
# smoke test: viết 1 file src/__smoke/wb.test.ts gọi generator với dữ liệu giả rồi
npx vitest run src/__smoke/wb.test.ts && rm -rf src/__smoke
```

Nếu sửa bảng tính tiền bản quyền: chạy lại ca mẫu **15 phòng karaoke ⇒ 53.773.632đ** và đối chiếu preview trên UI phải khớp từng dòng.
