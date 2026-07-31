# Production Environment Guide

> **Trạng thái:** Phase 1 — Chuẩn bị production env. Chưa deploy.
> **Tác động lên app LAN/local:** Không có. App nội bộ tiếp tục chạy bình thường.

---

## Tổng quan

Phase 1 chỉ tạo **cấu hình production template** và **tài liệu**. Không có thay đổi nào ảnh hưởng đến app đang chạy ở `http://127.0.0.1:8000`.

Cấu hình production gồm:
- `F:\APPs\.env.production.example` — Backend env template
- `F:\APPs\frontend\.env.production.example` — Frontend env template
- `F:\APPs\docs\production-env.md` — Tài liệu này

---

## Nguyên tắc tách biệt

### App LAN/local (KHÔNG đụng trong Phase 1)
- `F:\APPs\.env` — env dev/local hiện tại, **giữ nguyên tuyệt đối**
- `http://127.0.0.1:8000` — chạy bình thường
- `scripts/dev-all.ps1` — không sửa
- `scripts/start-backend.ps1` — không sửa
- Vite dev server (`npm run dev`) — không đụng

### Lớp Public Internet (production path mới)
- `.env.production.example` — template, chưa có tác dụng
- `docker-compose.yml` — sẽ tạo ở Phase 2
- `Dockerfile.app` — sẽ tạo ở Phase 2
- `Caddyfile` — sẽ tạo ở Phase 2

**Hai đường chạy hoàn toàn tách biệt.**

---

## Cách copy template thành env thật

```powershell
# 1. Copy backend template
Copy-Item F:\APPs\.env.production.example F:\APPs\.env.production

# 2. Copy frontend template
Copy-Item F:\APPs\frontend\.env.production.example F:\APPs\frontend\.env.production

# 3. Edit .env.production — fill in all <CHANGE_ME_*> placeholders
# 4. NEVER commit .env.production to version control
```

---

## Biến bắt buộc phải đổi trước khi public

| Biến | Giá trị hiện tại | Phải đổi thành |
|---|---|---|
| `APP_ENV` | `production` (template đã đúng) | — |
| `DEV_AUTH_ENABLED` | `false` (template đã đúng) | — |
| `JWT_SECRET_KEY` | `<CHANGE_ME_256BIT_RANDOM_SECRET>` | Secret 256-bit ngẫu nhiên |
| `DATABASE_URL` | `<STRONG_PASSWORD>` | Password DB mạnh |
| `CORS_ALLOWED_ORIGINS` | `https://<YOUR_APP_DOMAIN>` | Domain HTTPS thật |
| `INTERNAL_QR_PORTAL_PASSWORD` | `<QR_PORTAL_PASSWORD>` | Password QR Portal thật |
| `INTERNAL_QR_PORTAL_USERNAME` | `<QR_PORTAL_USERNAME>` | Username QR Portal thật |

### Sinh JWT secret

```powershell
# Windows
openssl rand -hex 32

# Hoặc PowerShell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToHexString($bytes)
```

### Database URL

```
# Docker Compose (đúng):
postgresql://vcpmc_user:<PASSWORD>@postgres:5432/vcpmc_contract
#                    ^ service name trong docker-compose.yml

# Standalone server:
postgresql://vcpmc_user:<PASSWORD>@<DB_HOST>:5432/vcpmc_contract
```

---

## CORS — Nguyên tắc

### ĐÚNG
```
CORS_ALLOWED_ORIGINS=https://app.vcpmc.domain
CORS_ALLOWED_ORIGINS=https://vcpmc.example.com
```

### SAI (không dùng trong production)
```
CORS_ALLOWED_ORIGINS=*
CORS_ALLOWED_ORIGINS=http://*
CORS_ALLOWED_ORIGINS=https://app.vcpmc.domain,*
```

- Chỉ dùng HTTPS origin đầy đủ.
- Không wildcard.
- Backend đọc `CORS_ALLOWED_ORIGINS` từ env, parse comma-separated list (`config.py:103-105`).

---

## DEV_AUTH_ENABLED

**Phải là `false` ở production.**

Dev auth bypasses password verification — chỉ dùng cho development local.

---

## JWT_SECRET_KEY

**Phải là secret 256-bit (64 hex chars) ngẫu nhiên, không dùng placeholder.**

Template: `JWT_SECRET_KEY=<CHANGE_ME_256BIT_RANDOM_SECRET>`

Sau khi sinh secret, **không bao giờ đổi lại** nếu đã có users. Đổi secret = tất cả JWT tokens hiện tại bị vô hiệu, users phải login lại.

---

## QR Portal

### Không đổi trong Phase 1

```
INTERNAL_QR_PORTAL_BASE_URL=http://14.241.251.220:7879
```

Đây là URL nội bộ của QR Portal. Giữ nguyên:
- Extension vẫn dùng `http://14.241.251.220:7879/dashboard/content`
- `popup.js:343` mở QR Portal với URL này
- Không cần HTTPS cho QR Portal ở phase này

### Kiểm tra connectivity

Trước khi deploy production, verify server có access được QR Portal:

```powershell
# Từ server production, chạy:
curl -I http://14.241.251.220:7879

# Nếu không access được, QR automation sẽ fail.
# Giải pháp: dùng "Mở portal thủ công" fallback.
```

---

## Feature Flags Production

| Flag | Giá trị | Ý nghĩa |
|---|---|---|
| `CREATE_CONTRACT_WRITE_ENABLED` | `true` | Cho phép tạo hợp đồng thật |
| `CREATE_CONTRACT_ROLLBACK_ONLY` | `false` | Tắt rollback mode |
| `CREATE_CERTIFICATE_WRITE_ENABLED` | `true` | Cho phép tạo GCN thật |
| `ASSIGN_CERTIFICATE_NUMBER_ENABLED` | `true` | Cho phép gán số GCN |
| `EXPORT_RENDER_ENABLED` | `false` | Tắt render DOCX (cần LibreOffice) |

---

## Frontend Production Env

Frontend production env đơn giản:

```
VITE_API_BASE_URL=/api
VITE_APP_NAME=VCPMC_NEW_APP
VITE_APP_INSTANCE=vcpmc-prod
```

- `VITE_API_BASE_URL=/api` — relative path, hoạt động với bất kỳ domain nào
- Frontend gọi `/api/...` → Caddy reverse proxy → backend
- Không cần full URL vì cùng origin

---

## Storage và Templates trong Container

```
Host path          → Container path
./storage          → /app/storage
./templates        → /app/templates:ro
```

- `./storage` bind-mounted vào container — data tồn tại sau khi restart
- `./templates` bind-mounted read-only — cập nhật template DOCX mà không cần rebuild image
- Các path trong `.env.production` phải khớp với container paths:
  - `EXPORT_OUTPUT_ROOT=/app/storage`
  - `EXPORT_TEMPLATE_ROOT=/app/templates`
  - `PREVIEW_STORAGE_PATH=/app/storage/preview`
  - `INTERNAL_QR_DOWNLOAD_DIR=/app/storage/gcn_qr`

---

## Backend đọc env như thế nào

`backend/app/core/config.py` đọc `.env` từ `F:\APPs\.env` (project root):

```python
_BACKEND_ROOT = Path(__file__).resolve().parents[2]  # = F:\APPs
_ENV_PATH = _BACKEND_ROOT / ".env"
```

**Tác động:**
- Dev: backend đọc `F:\APPs\.env` (env dev hiện tại)
- Production Docker: backend đọc `.env` từ container's CWD
  - Trong `docker-compose.yml`, set `env_file: ./env.production`
  - Container's CWD là `/app` (với `WORKDIR /app/backend`)
  - Nên cần `env_file: ./env.production` trỏ đúng file

**Phase 2 sẽ xử lý:** `docker-compose.yml` dùng `env_file: ./env.production` (bản đã fill secrets).

---

## Không làm gì trong Phase 1

- Không sửa `F:\APPs\.env`
- Không tạo `.env.production` chứa secret thật
- Không tạo Docker files
- Không sửa business logic (`app/api/*`, `app/services/*`, `app/models/*`)
- Không sửa UI (`frontend/src/*`)
- Không sửa GCN workflow
- Không sửa Reports
- Không sửa Auth workflow
- Không sửa database schema
- Không sỬa extension
- Không đổi QR Portal URL
- Không đổi port dev

---

## Nếu dừng giữa chừng

**App LAN/local vẫn chạy bình thường.**

Phase 1 chỉ tạo 3 file mới:
- `F:\APPs\.env.production.example`
- `F:\APPs\frontend\.env.production.example`
- `F:\APPs\docs\production-env.md`

Các file này không ảnh hưởng app đang chạy.

---

## Phase tiếp theo: Phase 2 — Docker Compose Production

Sau Phase 1, Phase 2 sẽ tạo:
- `F:\APPs\docker-compose.yml`
- `F:\APPs\Dockerfile.app`
- `F:\APPs\docker-entrypoint.sh`
- `F:\APPs\Caddyfile`
- `F:\APPs\.dockerignore`
- `F:\APPs\secrets/` directory

Phase 2 test trên máy hiện tại trước, không ảnh hưởng `http://127.0.0.1:8000`.

---

## Checklist trước Phase 2

- [ ] Đọc và hiểu `.env.production.example`
- [ ] Biết cách sinh JWT secret 256-bit
- [ ] Biết password PostgreSQL production
- [ ] Có domain HTTPS cho app (hoặc dùng tạm domain placeholder)
- [ ] Backup `F:\APPs\.env` (để phòng)
- [ ] Hiểu `.env.production` KHÔNG được commit
