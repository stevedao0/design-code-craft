# VCPMC QR Helper V2 — Chrome Extension

Tự điền popup "Thêm mới Thông tin" trên portal QR VCPMC.

**Lưu ý quan trọng:** Extension này **không tự bấm Lưu**, không gọi API tạo/lưu của portal. User tự kiểm tra và bấm Lưu.

---

## Cài đặt (1 lần)

1. Mở **chrome://extensions**
2. Bật **Developer mode** (góc trên bên phải)
3. Click **Load unpacked**
4. Chọn thư mục:
   ```
   F:\APPs\browser-extension\vcpmc-qr-helper-v2
   ```
5. Extension **VCPMC QR Helper V2** xuất hiện trong thanh toolbar

---

## Cập nhật Extension

1. Sau khi update code extension trong thư mục trên
2. Mở **chrome://extensions**
3. Click **Reload** (biểu tượng mũi tên) trên thẻ **VCPMC QR Helper V2**

---

## Cách sử dụng

### Bước 1 — Gửi dữ liệu từ app In GCN

1. Mở app In GCN (frontend đang chạy)
2. Chọn hợp đồng hoặc nhập thông tin tự do
3. Nhập **Số GCN** (bắt buộc)
4. Cuộn xuống dưới, tìm box **"QR Helper Extension"**
5. Bấm **"Gửi dữ liệu sang QR Helper"**
6. Nếu thấy thông báo "Đã gửi: ..." = thành công

### Bước 2 — Mở portal QR

1. Bấm **"Mở portal QR"** trong box QR Helper Extension
2. Hoặc mở thủ công: `http://14.241.251.220:7879/dashboard/content`

### Bước 3 — Bấm Thêm mới

1. Trên portal, tìm nút **"Thêm mới"** hoặc **"+ Thêm"**
2. Click để mở popup **"Thêm mới Thông tin"**
3. **KHÔNG ĐÓNG POPUP** — giữ popup đang mở

### Bước 4 — Điền bằng extension

1. Click **icon extension** (góc trên bên phải Chrome)
2. Popup hiện ra, kiểm tra phần **"Dữ liệu đã nhận"** có đúng hợp đồng
3. Bấm **"Điền popup QR hiện tại"**
4. Extension tự điền các trường trong popup
5. Nếu thấy overlay xanh "Đã điền X trường" = thành công

### Bước 5 — Kiểm tra và Lưu

1. **Kiểm tra tất cả trường** trong popup
2. Sửa nếu cần
3. Bấm **"Lưu"** trên popup portal (extension không bấm)

---

## Nếu điền không đúng

1. Click icon extension
2. Bấm **"Quét popup hiện tại"**
3. Copy JSON gửi cho người phát triển
4. JSON chứa danh sách control tìm thấy trong popup

---

## Các trường điền tự động

| # | Trường | Ghi chú |
|---|--------|---------|
| 1 | Tình trạng | "Phát hành" (tùy chọn) |
| 2 | Lĩnh vực | domain từ hợp đồng; karaoke → "Karaoke" |
| 3 | Số hợp đồng | giữ nguyên /PR hoặc /MR |
| 4 | Số giấy chứng nhận | bắt buộc — từ ô Số GCN |
| 5 | Ngày in giấy chứng nhận | dd/mm/yyyy; mặc định hôm nay |
| 6 | Ngày bắt đầu | dd/mm/yyyy |
| 7 | Ngày kết thúc | dd/mm/yyyy |
| 8 | Tên đơn vị | bắt buộc |
| 9 | Địa chỉ | bắt buộc |

---

## Cấu trúc files

```
F:\APPs\browser-extension\vcpmc-qr-helper-v2\
├── manifest.json           — Extension manifest V3
├── background.js         — Service worker: lưu payload, routing messages
├── content-app-bridge.js — Chạy trên app In GCN: nhận postMessage → gửi extension
├── content-portal-fill.js — Chạy trên portal: scan popup, điền form
├── popup.html            — Giao diện popup của extension
└── popup.js             — Logic popup

F:\APPs\frontend\src\pages\CertificatePrintPage.tsx — Box "QR Helper Extension" trong app
```

---

## Phân biệt môi trường

| Môi trường | URL | Script chạy |
|------------|-----|-------------|
| App In GCN | `localhost:8000`, `127.0.0.1:8000` | `content-app-bridge.js` |
| Portal QR | `14.241.251.220:7879` | `content-portal-fill.js` |

---

## Câu hỏi thường gặp

**Q: Extension không phản hồi khi bấm "Gửi dữ liệu"?**
A: Kiểm tra đã cài extension chưa (chrome://extensions). Nếu chưa cài, bấm Load unpacked và chọn thư mục extension.

**Q: Điền không đúng trường?**
A: Bấm "Quét popup hiện tại" trong popup extension để xem cấu trúc popup portal, gửi JSON cho dev.

**Q: Điền bị thiếu trường?**
A: Thiếu dữ liệu trong app In GCN. Nhập đủ Số GCN, ngày bắt đầu, ngày kết thúc, tên đơn vị, địa chỉ rồi gửi lại.

**Q: Cần cài lại extension trên mỗi máy?**
A: Đúng. Mỗi máy cần cài extension 1 lần. Khi update code, chỉ cần Reload trong chrome://extensions.

**Q: Extension có gửi dữ liệu lên server không?**
A: Không. Payload chỉ lưu trong `chrome.storage.local` trên máy local.
