# Docker Production Guide

> **Trạng thái:** Phase 2 — Docker Compose production test
> **Tác động lên app LAN/local:** Không có. App `http://127.0.0.1:8000` tiếp tục chạy bình thường.

---

## Tổng quan

Phase 2 tạo Docker stack để test app production **trên máy hiện tại**, hoàn toàn tách biệt với dev stack.

```
App LAN/local (không đụng)
  http://127.0.0.1:8000

App production test (mới)
  http://127.0.0.1:18000
```

Phase 2 **KHÔNG có**:
- Caddy / HTTPS (sẽ làm ở Phase 5)
- Public internet
- Caddyfile

---

## Files đã tạo

| File | Purpose |
|---|---|
| `F:\APPs\docker-compose.prod.yml` | Production stack (postgres + app) |
| `F:\APPs\Dockerfile.app` | FastAPI + React container |
| `F:\APPs\.dockerignore` | Build ignore |
| `F:\APPs\docs\docker-production.md` | Tài liệu này |

---

## Trước khi chạy: Tạo `.env.production`

### Bước 1: Copy template

```powershell
# Chạy trong F:\APPs
Copy-Item .env.production.example .env.production
```

### Bước 2: Fill secrets

Mở `.env.production` bằng editor, thay các placeholder:

```env
# Bắt buộc — sinh JWT secret 256-bit
JWT_SECRET_KEY=<SINH_SECRET_256BIT>

# Bắt buộc — password PostgreSQL production (dùng cho cả POSTGRES_PASSWORD và DATABASE_URL)
# ví dụ: openssl rand -hex 16
POSTGRES_PASSWORD=<STRONG_PASSWORD>

# Bắt buộc — phải cùng password với POSTGRES_PASSWORD
DATABASE_URL=postgresql://vcpmc_user:<STRONG_PASSWORD>@postgres:5432/vcpmc_contract

# Tạm dùng domain placeholder (Phase 5 sẽ đổi)
CORS_ALLOWED_ORIGINS=http://127.0.0.1:18000

# QR Portal credentials
INTERNAL_QR_PORTAL_USERNAME=<QR_USERNAME>
INTERNAL_QR_PORTAL_PASSWORD=<QR_PASSWORD>
```

### Sinh JWT secret

```powershell
# Windows
openssl rand -hex 32

# PowerShell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToHexString($bytes)
```

> **Lưu ý:** `.env.production` chứa secrets local-test (JWT, DB password). Không commit file này.
> Khi deploy production thật, tạo `.env.production` mới với secrets khác và domain HTTPS.

---

## Lệnh kiểm tra và chạy

### 1. Validate config (trước khi build)

```powershell
cd F:\APPs
docker compose -f docker-compose.prod.yml --env-file .env.production config
```

Nếu thấy lỗi về biến thiếu, tức là `.env.production` chưa fill đủ secrets.

### 2. Build image

```powershell
docker compose -f docker-compose.prod.yml --env-file .env.production build
```

Lần đầu mất 5-10 phút (download Python, Node.js, build frontend).

### 3. Chạy stack

```powershell
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

### 4. Kiểm tra

```powershell
# Health check
curl http://127.0.0.1:18000/api/health

# Xem logs
docker compose -f docker-compose.prod.yml --env-file .env.production logs app
docker compose -f docker-compose.prod.yml --env-file .env.production logs postgres

# Kiểm tra containers
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

### 5. Dừng stack

```powershell
docker compose -f docker-compose.prod.yml --env-file .env.production down
```

---

## Production Test URLs

| Service | URL |
|---|---|
| App (frontend + API) | `http://127.0.0.1:18000` |
| Health check | `http://127.0.0.1:18000/api/health` |
| Swagger docs | `http://127.0.0.1:18000/docs` (OpenAPI) |

> **Lưu ý:** Swagger docs vẫn enable trong Phase 2 test. Sẽ disable ở Phase 4.

---

## Storage và Templates

### Bind mounts

```
Host                     Container
F:\APPs\storage   → /app/storage
F:\APPs\templates → /app/templates:ro
```

- `storage` bind-mounted read-write — dữ liệu runtime tồn tại sau restart
- `templates` bind-mounted read-only — cập nhật DOCX templates mà không rebuild image

### Không dùng named volumes

Named volumes rỗng sẽ che mất dữ liệu đã copy trong image. Bind mounts giữ nguyên dữ liệu host.

---

## Database

### Không expose ra internet

```
postgres service:  vcpmc_postgres_prod
DB name:           vcpmc_contract
User:              vcpmc_user
Password:          từ .env.production (POSTGRES_PASSWORD)
Internal port:     5432 (không publish ra host)
```

Backup script dùng `docker exec` theo container name — không cần port 5432 publish:

```powershell
docker exec vcpmc_postgres_prod pg_dump -U vcpmc_user vcpmc_contract > backup.dump
```

### Nếu cần access từ host (local-only)

**TẠM THỜI** — chỉ khi cần test backup/restore từ host:

```powershell
# Tạm thêm vào docker-compose.prod.yml (SỬA LẠI SAU KHI DÙNG XONG)
ports:
  - "127.0.0.1:5432:5432"

# Sau đó chạy restore từ host:
pg_restore -h localhost -U vcpmc_user -d vcpmc_contract backup.dump
```

**XÓA dòng port 5432 sau khi test xong.**

---

## Docker Compose file naming

**PHẢI dùng `-f docker-compose.prod.yml`** — không dùng `docker-compose.yml`.

Sai:
```powershell
docker compose up -d          # dùng docker-compose.yml (nếu có) — không đúng production
docker compose down           # dùng docker-compose.yml — CÓ THỂ SAI STACK
```

Đúng:
```powershell
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml down
```

Cảnh báo: `docker compose down` (không chỉ `-f`) sẽ áp dụng cho `docker-compose.yml` default. Nếu chỉ có `docker-compose.prod.yml`, PowerShell có thể không tìm thấy `docker-compose.yml` và báo lỗi. Luôn dùng `-f`.

---

## Không làm gì trong Phase 2

- Không sửa `F:\APPs\.env` (dev env)
- Không tạo `docker-compose.yml` default
- Không tạo Caddyfile
- Không public internet
- Không tạo `.env.production` chứa secret thật (user tự tạo)
- Không sửa business logic
- Không đổi database schema
- Không expose Postgres port 5432 ra internet
- Không stop/down stack dev/local

---

## Nếu build thất bại

### Lỗi `app.main` import

Kiểm tra `Dockerfile.app` có:
```dockerfile
ENV PYTHONPATH=/app/backend
WORKDIR /app
CMD ["uvicorn", "app.main:app", ...]
```

### Lỗi `pgvector` extension

Database initialization mất 10-20s. Health check chờ `pg_isready`. Kiên nhẫn.

### Lỗi CORS

Phase 2 test dùng `CORS_ALLOWED_ORIGINS=http://127.0.0.1:18000`. Nếu browser chặn, kiểm tra devtools → Network → CORS error.

### Frontend build fail

Kiểm tra `npm ci` trong container — cần internet để download packages.

---

## Nếu dừng giữa chừng

**App LAN/local vẫn chạy bình thường.** Phase 2 tạo 4 files mới, không ảnh hưởng stack dev.

---

## Phase tiếp theo: Phase 3 — Backup/Restore Test

Sau khi Docker stack chạy được ở port 18000:
1. Tạo backup từ production stack
2. Test restore vào test database
3. Verify table counts

---

## Checklist trước Phase 3

- [ ] `.env.production` đã tạo với secrets thật
- [ ] `docker compose -f docker-compose.prod.yml --env-file .env.production config` không lỗi
- [ ] `docker compose -f docker-compose.prod.yml --env-file .env.production build` thành công
- [ ] `docker compose -f docker-compose.prod.yml --env-file .env.production up -d` chạy
- [ ] `curl http://127.0.0.1:18000/api/health` → `{"status":"ok"}`
- [ ] `docker exec vcpmc_postgres_prod pg_isready -U vcpmc_user` → `accepting connections`
- [ ] Login thành công qua `http://127.0.0.1:18000`
- [ ] Không có lỗi trong `docker compose logs`
