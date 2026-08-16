# Đơn giản hóa xuất Excel bảng tính tiền bản quyền

## Hiện trạng đã kiểm tra

- `frontend/src/lib/exportRoyaltyQuoteDocx.ts` đã bị xóa ở commit trước; trong trang tính tiền bản quyền chỉ còn `ExcelExportButton` + `ContractExcelExportDialog`. Không còn nút Xuất/Tải Word cho báo tiền.
- Các chỗ còn chữ "Xuất Word" là của **hợp đồng** (`ContractsDesktopTable`, `ContractMobileCard`) và **báo cáo** (`ReportsPage`) — nằm ngoài phạm vi, giữ nguyên.
- Công thức đã đúng hướng: `pricingSnapshot.ts` không còn nhân diện tích (`effectiveAreaM2 = areaM2`), `RoyaltyCalculatorPage` tính `urbanAdjustedAmount = baseTierAmount × urbanFactor`, `contractRoyaltyModel` có `amountAfterUrban` cho từng bậc. Sẽ chạy kiểm chứng số trước khi sửa.
- `generateContractRoyaltyWorkbook.ts` hiện tạo **3 sheet** ("Tổng hợp" hiển thị, "Chi tiết" và "Bảng hợp đồng" ẩn) và có "Chưa khai báo", dòng "Cộng" lặp — đây là phần cần dọn.

## Việc sẽ làm

### 1. Xác minh số liệu trước
Chạy script tính nhanh trên logic hiện tại:
- Cà phê 100 m², đô thị I 80% → phải ra 5.566.000đ (bậc 3 phải nhận 50 m²).
- Nhà hàng 100 m², đô thị II 50% → phải ra 5.692.500đ.
- Cách 1 và Cách 2 cùng tổng, kể cả khi chạm mức trần.
Nếu lệch, sửa tại `royaltyCalc`/`RoyaltyCalculatorPage` để tier allocation luôn dùng input gốc và tỷ lệ đô thị chỉ nhân vào tiền.

### 2. Viết lại workbook gửi khách
`generateContractRoyaltyWorkbook.ts` rút gọn còn **một worksheet duy nhất**: "Bảng tính tiền bản quyền". Xóa hai sheet ẩn.

Mỗi khu vực gồm: Khu vực/địa điểm · Lĩnh vực áp dụng · Quy mô thực tế · Phân loại đô thị, rồi bảng:

```text
Bậc áp dụng | Số lượng thực tế | MLCS | Hệ số điều chỉnh | Tỷ lệ đô thị | Thành tiền
```

- Cột "Tỷ lệ đô thị" (đầy đủ: "Tỷ lệ áp dụng theo phân loại đô thị") ghi tỷ lệ thật (80%, 50%…), không bao giờ ghi 100% khi thực tế khác.
- Thành tiền dùng công thức Excel tham chiếu MLCS × hệ số × số lượng × tỷ lệ đô thị.
- Kết toán: Tổng trước VAT → VAT → Tổng thanh toán → Bằng chữ, mỗi dòng chỉ xuất hiện một lần.
- Dòng mức trần chỉ in khi thực sự áp trần.
- **Khối "Hướng dẫn đọc bảng tính"** cuối sheet: giải thích ngắn gọn theo ngôn ngữ khách hàng — thành tiền mỗi bậc = MLCS × hệ số biểu mức × số lượng × tỷ lệ đô thị; cộng các bậc ra tiền trước thuế; cộng thuế GTGT ra tổng thanh toán. Tuyệt đối không nhắc thứ tự xử lý nội bộ.
- **Letterhead & chân trang**: dùng `vcpmcIdentity.ts` — tên đầy đủ VCPMC, website vcpmc.org, và thông tin **Chi nhánh phía Nam** (địa chỉ, điện thoại, email) vì app phục vụ chi nhánh phía Nam.


### 3. Dọn nội dung nội bộ khỏi file khách
Xóa khỏi mọi cell/comment/shared string: "Cách áp dụng đô thị", "Cách 1/Cách 2", "Trước khi chia bậc", "Sau khi cộng tiền bậc", "Diện tích hiệu dụng / tính phí", chú thích ô nhập màu xanh, hướng dẫn khách sửa MLCS/VAT, các đoạn diễn giải văn xuôi. Không xuất `urbanMode`/`urbanModeLabel` — chỉ giữ trong state popup.

Thiếu tên đơn vị hoặc địa chỉ: chặn xuất và báo người dùng nhập, không in "Chưa khai báo".

Giữ lại: đơn vị, địa chỉ, thời hạn, ngày lập, lĩnh vực, quy mô, phân loại + tỷ lệ đô thị, MLCS, hệ số, số lượng bậc, thành tiền từng dòng, tổng, VAT, tổng thanh toán, bằng chữ, và căn cứ pháp lý ngắn:

```text
Căn cứ Phụ lục II ban hành kèm theo Nghị định 17/2023/NĐ-CP,
được sửa đổi, bổ sung bởi Nghị định 134/2026/NĐ-CP.
Áp dụng tỷ lệ theo phân loại đô thị: Đô thị loại I (80%).
```

### 4. Bảo vệ file
Bật worksheet protection: khóa cell công thức, MLCS, VAT, tỷ lệ đô thị. Không tạo hidden sheet.

### 5. Dọn model
Bỏ các field chỉ phục vụ cách tính cũ (`effectiveAreaM2`, `effectiveArea`, `effectiveQuantity`) khỏi type/adapter/snapshot/export mapping nếu không còn consumer. Export luôn dùng `originalQuantity` · `urbanFactor` · `urbanAdjustedAmount`.

### 6. Kiểm thử
- Generate workbook rồi **đọc lại bằng script** (exceljs/openpyxl): đúng 1 visible sheet, không chứa text bị cấm, tỷ lệ đô thị đúng, tổng khớp UI, không có #REF!/#VALUE!/#NAME?.
- Kiểm tra multi-location, multi-field, Karaoke không đổi kết quả.
- Xác nhận DOCX hợp đồng và payload tạo hợp đồng không bị đụng.
- Chạy build frontend thực tế của project.

### 7. Commit
Commit trực tiếp trên `main`, không tạo branch, không force-push:

```text
fix(pricing): simplify customer excel export
```

## Ghi chú kỹ thuật

File chạm tới: `generateContractRoyaltyWorkbook.ts` (viết lại phần lớn), `contractRoyaltyModel.ts`, `pricingSnapshot.ts`, `calculationTypes.ts`, `calculationSnapshotAdapter.ts`, `ContractExcelExportDialog.tsx`, `RoyaltyCalculatorPage.tsx`. Không đụng backend, renderer hợp đồng, biểu hệ số/MLCS/VAT.
