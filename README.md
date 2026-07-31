# VCPMC Contract Creation Platform

Internal contract, licensing, copyright, certificate, dispatch, report, and admin platform.

## Repository Layout

- `frontend/` — React + Vite + TypeScript app.
  - `src/pages/` — top-level routes (Contracts, Create Contract, Certificates, Reports, …).
  - `src/components/contract/` — domain-specific UI (MusicUsageAreaSection, SimpleRoyaltyInput, …).
  - `src/components/app-ui/` — shared design system primitives (FormSection, FieldGrid, Input, …).
  - `src/lib/` — API clients, domain types, validation, pricing snapshot helpers.
  - `src/theme/`, `src/index.css` — Tailwind/shadcn-style tokens.
- `backend/` — FastAPI service.
  - `app/api/` — routers (contracts, certificates, dispatches, reports, …).
  - `app/services/`, `app/renderers/`, `app/calculations/` — domain logic, pricing, DOCX export.
  - `app/schemas/`, `app/models/` — request/response and persistence models.
  - `migrations/` — Alembic-style SQL migrations.
- `browser-extension/vcpmc-qr-helper-v2/` — QR Portal Assistant extension source (manifest, popup, content scripts).
- `templates/Background/`, `templates/Media/` — DOCX templates consumed by the backend renderer.
- `scripts/` — minimum helper scripts (`dev-all.ps1`, `ensure-venv.ps1`, `start-backend.ps1`, `start-backend-prod.ps1`, `test-backend.ps1`, `package-qr-extension.ps1`, `check-port-8000.ps1`).
- `docs/` — architectural reference, runbooks, policies, plans.
- `docker-compose.prod.yml`, `Dockerfile.app` — production runtime image.
- `.env.production.example`, `backend/.env.example` — placeholder env templates.

## Local Setup

### Prerequisites

- Node.js 20 LTS
- Python 3.11
- PostgreSQL 14+ (or use the bundled `docker-compose.prod.yml` image)

### Frontend

```bash
cd frontend
npm install
npm run dev      # http://127.0.0.1:5199
npm run build    # produces frontend/dist
npm run lint
```

### Backend

```bash
cd backend
python -m venv ../.venv
../.venv/Scripts/python -m pip install -r requirements.txt
../.venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Or use the helper scripts:

```bash
pwsh scripts/ensure-venv.ps1 -InstallRequirements
pwsh scripts/dev-all.ps1
```

### Environment Variables

Copy `.env.production.example` to `.env.production` and fill in real values. The committed `.env.production.example` only contains placeholder names — never commit secrets.

Backend reads from `backend/.env` (see `backend/.env.example`). Required variable names include:

- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `JWT_ALGORITHM`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `CORS_ALLOWED_ORIGINS`
- `EXPORT_TEMPLATE_ROOT`
- `EXPORT_OUTPUT_ROOT`
- `INTERNAL_QR_PORTAL_BASE_URL`
- `INTERNAL_QR_PORTAL_USERNAME`
- `INTERNAL_QR_PORTAL_PASSWORD`
- `QR_PORTAL_ALLOW_REMOTE_PLAYWRIGHT`
- Feature flags: `CREATE_CONTRACT_*`, `CREATE_CERTIFICATE_*`, `PRINT_CERTIFICATE_*`, `ASSIGN_CERTIFICATE_NUMBER_*`, `DELETE_*`

## Entry Point — Create Contract

The main page under review lives at:

```
frontend/src/pages/CreateContractPage.tsx
```

It composes the existing `FormSection`, `FieldGrid`, `Input` design system primitives together with domain components in `frontend/src/components/contract/` and pricing components in `frontend/src/components/app-ui/data-table/` plus `frontend/src/components/pricing/` (Karaoke FAB workspace). Section 5 of the form adapts its body depending on the selected domain code (`KARAOKE`, `KHU_VUI_CHOI`, `BACKGROUND`, …).

## Tests

Backend smoke checks live alongside `scripts/`. Run them after the backend is up:

```bash
pwsh scripts/test-backend.ps1
```

## Documentation

- `docs/` — architecture and runbook notes.
- `MAGICPATTERN_UI_BRIEF.md` — focused brief for the MagicPattern design review.