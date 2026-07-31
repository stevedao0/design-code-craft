---
name: vcpmc-ui-design
description: Ngôn ngữ thiết kế giao diện VCPMC (màu, token, component app-ui, responsive mobile/tablet, hero banner). Dùng khi tạo mới hoặc chỉnh sửa bất kỳ màn hình, card, bảng, dialog nào của app quản lý hợp đồng VCPMC.
---

# VCPMC UI Design

App: quản lý hợp đồng & tiền bản quyền âm nhạc của VCPMC (`frontend/`, React 18 + Vite, CSS thuần theo token, **không** dùng Tailwind/shadcn).

## Luật bất di bất dịch

1. **Không hardcode màu.** Mọi màu lấy từ biến trong `src/theme/tokens.css` (`var(--accent-primary)`, `var(--surface)`, …). Không viết `#fff`, `emerald`, `coral`, `navy` trong component.
2. **Xanh VCPMC là màu thương hiệu duy nhất**: `--accent-primary: #4A7202`. Không dùng tím/indigo/coral/teal làm accent.
3. **Màu ngữ nghĩa dùng đúng nghĩa**: `--accent-danger` (#9F1F1F) cho hết hạn/lỗi, `--accent-warning` (#B45309) cho sắp hết hạn/thiếu dữ liệu, `--accent-primary` cho thành công & thương hiệu. Không lấy xanh thương hiệu để báo lỗi.
4. **Tiếng Việt là ngôn ngữ UI.** Luôn dùng **“Thuế GTGT”**, không bao giờ “VAT”. Tiền tệ: `1.234.567 ₫` (`toLocaleString('vi-VN')`), ngày: `dd/mm/yyyy`.
5. **Không tự tính lại tiền ở frontend.** Frontend chỉ hiển thị số backend trả về (snapshot). Muốn thêm số mới → xin từ backend.

## Token chính (`src/theme/tokens.css`)

| Nhóm | Biến |
| --- | --- |
| Nền / bề mặt | `--app-bg` #F7F3EA, `--surface`, `--surface-muted` |
| Chữ | `--text-primary`, `--text-secondary`, `--text-muted` |
| Viền | `--border-subtle`, `--border-default`, `--border-strong` |
| Accent | `--accent-primary`, `--accent-primary-hover`, `--accent-primary-soft`, `--accent-warning(-soft)`, `--accent-danger(-soft)`, `--accent-info(-soft)` |
| Chữ cỡ | `--text-page-title`, `--text-section-title`, `--text-body`, `--text-table`, `--text-label`, `--text-badge` |
| Khoảng cách | `--space-1..6`, `--section-gap`, `--card-padding`, `--workspace-gutter` |
| Khung | `--topbar-height` 4rem, `--sidebar-width`, `--workspace-max` 1600px |

Thêm màu/hiệu ứng mới ⇒ khai báo token trong `tokens.css` trước, rồi mới dùng.

## Component dùng lại (`src/components/app-ui/`)

Luôn tái sử dụng, đừng dựng lại card/nút/bảng thủ công:

- `Page`, `PageHeader` (hero banner `/brand/vcpmc-page-hero.jpg` + lớp phủ xanh), `Section`, `ContentCard`
- `FormSection` — khối form có badge số thứ tự xanh
- `Button`, `Badge`, `Dialog`, `Select`, `Input`, `Checkbox`, `EmptyState`
- `DataTable` — bảng đã có `data-label` phục vụ card-mode responsive
- `AppShell`, `AppRail` (sidebar 72px, gradient xanh), `CommandRibbon` (topbar cao 64px)

## Responsive (bắt buộc kiểm tra)

- Ba mốc phải xem: **390px** (iPhone), **820px** (tablet), **1440px** (desktop).
- Bảng dữ liệu chuyển **card-mode từ ≤900px** (xem `src/theme/contracts.css`); mỗi ô hiện nhãn qua `data-label`.
- Không dùng chiều rộng cố định trong layout chính; grid dùng `repeat(auto-fit, minmax(…, 1fr))`.
- Thanh hành động dính đáy trên mobile phải có `padding-bottom: env(safe-area-inset-bottom)`.
- Vùng cuộn ngang phải bọc `overflow-x:auto` + `min-width` cho bảng, không để vỡ trang.
- Đã đặt `-webkit-text-size-adjust: 100%` ở `index.css` — đừng gỡ.

## Bố cục chuẩn một trang

```
PageHeader (hero banner + tiêu đề + nút hành động trong pill kính mờ)
  └ FilterBar dính (nếu có lọc)         → cuộn ngang chip trên mobile
  └ Dải thẻ KPI / StatTile               → grid auto-fit
  └ Các Section/ContentCard nội dung     → mỗi ý một card, không lặp bảng
  └ Bảng dữ liệu (DataTable)             → sort ở header, không dropdown sort rời
```

Không lặp cùng một bảng/số liệu ở hai chỗ trên cùng trang; gộp bằng tab trong một card.

## Quy trình khi sửa giao diện

1. Đọc token + component sẵn có trước khi viết CSS mới.
2. Sửa/ghép component `app-ui`, CSS đặt trong `src/theme/*.css` tương ứng (đừng rải inline style).
3. Chạy `npm run build` trong `frontend/`.
4. Chụp Playwright ở 390 / 820 / 1440px và soi lại: chữ tràn, chồng dòng, khoảng trắng lệch, tương phản kém.
