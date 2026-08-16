# Làm rõ 2 phương án đô thị trong file Excel

## Vấn đề đang thấy trong 2 file gửi lên

- **Phương án 1**: hệ số đô thị hiện rõ ở dòng riêng ("Áp dụng tỷ lệ đô thị — Đô thị loại I", `=ROUND(F25*0.8,0)`) → người đọc hiểu được.
- **Phương án 2**: 80% / 50% bị **giấu trong công thức từng bậc** (`=ROUND(MLCS*0.35*1*0.8,0)`), bảng không có cột nào ghi 80% → nhìn vào chỉ thấy số tiền lạ, không hiểu vì sao.
- Ngoài ra các ô tổng đang ghi công thức sai dạng `==F27` (thừa dấu `=`).

## Cách xử lý

### 1. Bảng bậc dùng chung 8 cột cho cả 2 phương án

```text
STT | Diễn giải bậc biểu mức | Số lượng | Hệ số/năm | Mức lương cơ sở | Thành tiền gốc | Tỷ lệ đô thị | Thành tiền (đồng)
```

- **Cột "Thành tiền gốc"**: luôn là `MLCS × hệ số × số lượng` (chưa đô thị).
- **Cột "Tỷ lệ đô thị"**: hiển thị `80%` (hoặc `50%`, `100%`, "Miễn áp dụng") — ở phương án 2 ghi tỷ lệ trên **từng dòng bậc**; ở phương án 1 các dòng bậc ghi `100%` và tỷ lệ thật hiện ở dòng áp dụng bên dưới.
- **Cột "Thành tiền"**: `= Thành tiền gốc × Tỷ lệ đô thị` (phương án 2), hoặc bằng đúng thành tiền gốc (phương án 1).

Nhờ vậy con số 80% luôn nhìn thấy được và cột cuối luôn giải thích được bằng phép nhân của 2 cột ngay trước nó.

### 2. Dòng diễn giải cách tính (không lộ thuật ngữ nội bộ)

Ngay dưới tiêu đề mỗi khối, thêm một dòng chữ nghiêng nêu đúng trình tự tính đang dùng:

- Phương án 1: "Tiền bản quyền = (Tổng các bậc) × Tỷ lệ đô thị (80%)".
- Phương án 2: "Tiền bản quyền = Tổng của (Từng bậc × Tỷ lệ đô thị 80%)".

Vẫn không xuất hiện chữ "Phương án/Phương thức/Option" trong file gửi khách.

### 3. Dòng cộng của mỗi khối

- Phương án 1: giữ nguyên 3 dòng — Cộng theo khung giá → Áp dụng tỷ lệ đô thị → Tiền bản quyền khu vực.
- Phương án 2: Cộng theo khung giá đổi nhãn thành "Cộng tiền bản quyền (đã áp tỷ lệ đô thị)" và bổ sung dòng "Cộng theo khung giá (trước đô thị)" lấy `SUM` cột "Thành tiền gốc" để đối chiếu.

### 4. Sửa lỗi công thức và bố cục in

- Bỏ dấu `=` thừa ở các ô `==F27`, `==SUM(...)`, `==ROUND(...)`.
- Bảng tổng hợp khu vực (mục D) giữ nguyên cột "Tỷ lệ đô thị" hiện có.
- Do thêm 2 cột, giảm bề rộng các cột và giữ `fitToWidth: 1` để vẫn in vừa A4 dọc; nếu chật thì chuyển vùng bảng sang khổ ngang.

## Kỹ thuật

- Sửa duy nhất `frontend/src/lib/calculations/generateContractRoyaltyWorkbook.ts`: mở rộng lưới cột A–H, thêm 2 cột cho bảng bậc, cập nhật toàn bộ `mergeCells`/`printArea`, dùng `block.urbanFactor` + `block.urbanMode` để quyết định nội dung cột "Tỷ lệ đô thị".
- Không đổi logic tính tiền trong `royaltyCalc.ts` / `contractRoyaltyModel.ts` — số tiền kết quả giữ nguyên như hiện nay.
- Kiểm tra lại bằng cách xuất thử cả 2 phương án và chạy recalculate để chắc chắn 0 lỗi công thức.
