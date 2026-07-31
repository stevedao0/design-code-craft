## Hiện trạng (đã kiểm tra trong code)

Shell thực tế đang dùng là `CommandCenter` = `AppRail` (sidebar dọc) + `CommandRibbon` (topbar), không phải `Sidebar.tsx`/`Topbar.tsx` cũ.

- Kích thước đã dùng chung token `--nav-size: 72px` (rail width = ribbon height) — số liệu đã bằng nhau, nhưng **cảm giác to/nhỏ khác nhau** vì nền khác nhau: rail dùng `--nav-surface-grad` (gradient dọc xanh → trắng ở đáy), ribbon dùng `--nav-ribbon-grad` (gradient ngang xanh → trắng ở phải). Hai bề mặt fade hai hướng nên chỗ giáp nhau lệch tông.
- Ribbon có thêm hairline gradient xanh 2px (`::after`), rail không có → viền hai thanh không đồng bộ.
- Góc logo: Orb 48px bo `12px`, nút nav bo `14px`; rail padding `10px 0 12px` (trên/dưới lệch) → 4 góc quanh logo không đều, ô góc rail × ribbon chưa được xử lý thành một khối thương hiệu.
- Trang login (`LoginPage.tsx`) hiện hardcode rất nhiều mã màu (#76B400, #4A7202, #DCE8CC…) thay vì token, và chưa có link website / Facebook.

---

## Phần A — Đồng bộ sidebar + topbar

### A1. Đồng bộ màu hai thanh
- Thay `--nav-surface-grad` và `--nav-ribbon-grad` bằng **một token nền duy nhất** `--nav-surface`: nền ivory phẳng + tint xanh brand rất nhẹ, không fade theo hướng.
- Cùng `border-color`, cùng độ dày 1px `--nav-brand-green-border` cho rail (border-right) và ribbon (border-bottom).
- Bỏ hairline 2px chỉ có ở ribbon; áp một accent hairline **giống nhau cho cả hai** (dọc ở mép trong rail, ngang ở mép dưới ribbon) → hai thanh đọc như một khung chữ L liền mạch.
- Đồng bộ `backdrop-filter`, `box-shadow`, màu chữ/icon idle (`--vc-text-muted`) và active (`--nav-brand-green`) giữa nút rail và nút ribbon.

### A2. Góc logo Orb — điểm nhấn chuyên nghiệp
- Ô góc thương hiệu 72×72 (đúng `--nav-size`) tại giao rail × ribbon: nền đậm hơn nền nav một bậc + viền brand, đóng vai trò "khớp nối" khung chữ L.
- Orb **giữ nguyên màu và ảnh logo**; chỉ chuẩn hoá hình học:
  - 48×48, bo `14px` — bằng đúng nút nav rail và nút action ribbon.
  - Căn giữa tuyệt đối trong ô 72px (padding rail cân đối lại), 4 góc đều nhau.
  - Ring hover/focus/active cùng offset để vòng sáng đều 4 phía.
- Nhấn bằng viền brand đậm hơn 1 bậc + inner highlight trắng (không glow loè); khi launcher mở, ô góc sáng đồng bộ với orb.

### A3. Bố cục lại rail + ribbon
- Rail 3 vùng cân đối: góc brand (72px) / nav chính (nút 48px, gap 6px, divider mảnh cùng màu) / cụm hệ thống + đăng xuất, padding trên–dưới bằng nhau.
- Ribbon 3 zone thẳng baseline: trái (back + breadcrumb) · giữa (command hint) · phải (action + ngày + avatar); mọi control cao 36–40px, bo 12–14px cùng hệ, gap chuẩn hoá; padding trái căn thẳng mép nội dung workspace.

---

## Phần B — Thương hiệu & trang login theo vcpmc.org

### B1. Tên ứng dụng
- Đổi tên hiển thị toàn hệ thống thành **"VCPMC Licensing Department"**: `frontend/index.html` (`<title>`, meta description), breadcrumb gốc và tooltip Orb, wordmark trên login.
- Giữ dòng phụ tiếng Việt "Trung tâm Bảo vệ quyền tác giả âm nhạc Việt Nam" (khớp `vcpmcIdentity.ts`).

### B2. Thiết kế lại trang login theo trang "Về VCPMC"
- Bố cục 2 cột giữ nguyên khung hiện tại nhưng làm lại chỉn chu:
  - **Cột trái (hero)**: dùng banner chính thức của trang Về VCPMC (`gioithieu-1920x360px`) — tải về `frontend/public/brand/` để không phụ thuộc hotlink; đặt làm ảnh nền có `object-position` an toàn + lớp phủ gradient xanh brand để chữ luôn nổi. Khẩu hiệu chính thức **"Sáng tạo dồi dào, Lợi ích đảm bảo"**, mô tả ngắn về chức năng cấp phép, logo VCPMC trong huy hiệu tròn trắng.
  - **Cột phải (form)**: card đăng nhập nền `--surface`, viền `--border-default`, tiêu đề "VCPMC Licensing Department", form gọn, nút chính xanh brand.
  - Mobile: hero thu thành dải banner trên đầu, overlay đủ tối để chữ đọc rõ; form không bao giờ đè lên vùng chữ ảnh.
- **Tương phản**: thay toàn bộ hex hardcode trong `LoginPage.tsx` bằng token (`--accent-primary`, `--text-primary`, `--border-default`…); chữ trên ảnh dùng nền phủ đảm bảo tối thiểu 4.5:1; placeholder/label đủ đậm.

### B3. Liên kết ngoài
- Chân trang login: cụm link **Website** `https://www.vcpmc.org/` và **Facebook** `https://www.facebook.com/profile.php?id=100064603609628` (icon + nhãn, `target="_blank" rel="noopener noreferrer"`, có `aria-label`).
- Thêm cùng cụm link vào menu/khu vực dưới của rail (hoặc mục "Giới thiệu" trong Command Launcher) để trong app cũng truy cập được.

---

## Chi tiết kỹ thuật
- File chạm: `frontend/src/theme/command-os.css` (token nav ~2250–2280, rule `.vcpmc-rail*`, `.vcpmc-orb*`, `.vcpmc-ribbon*`), `frontend/src/components/app-ui/{AppRail,CommandRibbon,CommandOrb}.tsx`, `frontend/src/pages/LoginPage.tsx`, `frontend/index.html`, thêm asset vào `frontend/public/brand/`.
- Không đổi logic nghiệp vụ, không recolor asset logo, không đụng `Sidebar.tsx`/`Topbar.tsx` cũ (shell hiện tại không dùng).
- Kiểm tra: `npm run build` trong `frontend/`, chụp Playwright ở 390 / 820 / 1440px cho login + shell, soi tương phản chữ và responsive rail ở breakpoint mobile (~dòng 3026 `command-os.css`).
