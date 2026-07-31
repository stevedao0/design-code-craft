# PHASE_DEVALL_PORT8000_VENV_REPORT

Date: 2026-05-09
Workspace: F:\APPs

## 1) Files created/changed

Created:
- F:\APPs\package.json
- F:\APPs\scripts\dev-all.ps1
- F:\APPs\scripts\ensure-venv.ps1
- F:\APPs\scripts\check-port-8000.ps1
- F:\APPs\activate.ps1
- F:\APPs\.vscode\settings.json

Changed:
- F:\APPs\.env.local
- F:\APPs\frontend\.env.local
- F:\APPs\frontend\src\lib\apiClient.ts
- F:\APPs\backend\.env
- F:\APPs\backend\.env.example
- F:\APPs\backend\app\main.py

## 2) Root scripts added

In `F:\APPs\package.json`:
- `dev:all`: `powershell -ExecutionPolicy Bypass -File ./scripts/dev-all.ps1`
- `build`: `npm run frontend:build`
- `frontend:install`: `npm --prefix frontend install`
- `frontend:build`: `npm --prefix frontend run build`
- `backend:venv`: `powershell -ExecutionPolicy Bypass -File ./scripts/ensure-venv.ps1`
- `backend:install`: `powershell -ExecutionPolicy Bypass -File ./scripts/ensure-venv.ps1 -InstallRequirements`
- `backend:start`: starts uvicorn from `F:\APPs\backend` using `F:\APPs\.venv\Scripts\python.exe`

## 3) Venv path

- Venv path: `F:\APPs\.venv`
- Interpreter: `F:\APPs\.venv\Scripts\python.exe`
- Backend requirements installed into this venv successfully.

## 4) Frontend build result

Command:
- `npm run build` (from `F:\APPs`)

Result:
- Success.
- Built output available at `F:\APPs\frontend\dist`.

## 5) Port 8000 process handling result

Command:
- `npm run dev:all`

Observed behavior:
- Frontend build step: success.
- Backend venv/install step: success.
- Port check step: detected existing listener on port 8000:
  - PID: `36932`
  - Process: `node.exe`
  - Command line: Cursor helper `...\cursor\...\node.exe server.mjs`
- Script behavior: **did NOT kill** this process because it is not clearly owned by NEW APP (`F:\APPs\.venv` / `F:\APPs\backend` / uvicorn from `F:\APPs`).
- `dev:all` stopped with clear safety error as designed.

Safety rule satisfied:
- Unknown process on 8000 was not killed.

## 6) Backend start + health result

Because port 8000 was occupied by unknown process, direct runtime on 8000 could not be completed safely.

Functional verification performed on temporary local test port with the same NEW APP backend code:
- Start command used:
  - `F:\APPs\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8101`
  - Working directory: `F:\APPs\backend`

Checks:
- `GET /api/health`: success.
- Health payload database: `vcpmc_contract_new_clone_20260509`.
- `GET /`: success (frontend served from backend static dist).
- Static asset under `/assets/*`: success.

## 7) Login result

Verified against cloned DB (not old DB):
- `POST /api/auth/login`: success with existing cloned user account.
- `GET /api/me` with bearer token: success.

Sensitive handling:
- No password hash exposed.
- No token value recorded in this report.
- Username/email masked in narrative where needed.

## 8) Frontend API base/runtime config

Set for same-origin backend entrypoint mode:
- `F:\APPs\frontend\.env.local`:
  - `VITE_API_BASE_URL=/api`
- `F:\APPs\frontend\src\lib\apiClient.ts` default:
  - `/api`

This removes dependency on external dev API host for the standard local run mode.

## 9) Terminal auto-activate setup

Added local activation helper:
- `F:\APPs\activate.ps1` activates `F:\APPs\.venv\Scripts\Activate.ps1`

Added VS Code workspace settings:
- `F:\APPs\.vscode\settings.json`
  - `python.defaultInterpreterPath = F:\APPs\.venv\Scripts\python.exe`
  - terminal cwd = `F:\APPs`
  - default terminal profile executes `F:\APPs\activate.ps1`

Optional global PowerShell profile setup (documented only, not applied automatically):
- Add call to `& 'F:\APPs\activate.ps1'` in user PowerShell profile if user wants global behavior.

## 10) DB safety confirmation

DB guard remains active in backend (`F:\APPs\backend\app\core\database.py`):
- Refuses old DB port `5432`.
- Refuses old DB name `vcpmc_contract`.
- Allows only clone DB port `5433` and db `vcpmc_contract_new_clone_20260509`.

Observed health confirms active DB:
- `vcpmc_contract_new_clone_20260509`.

## 11) Old app / old DB untouched confirmation

- No file modifications were made under `F:\VCPMC\APPS\contract`.
- No runtime configuration was changed to point NEW APP to old DB.
- No migration/drop/reset/destructive DB actions were executed.
- No Docker mutation actions were executed in this phase.

## 12) Known risks before next phase

1. Port 8000 currently occupied by unknown process (`node.exe` Cursor helper), preventing `npm run dev:all` from owning 8000.
2. Until port 8000 is free, user cannot complete the exact single-command run target on that port.
3. Existing older backend process on 8099 may still be running in the environment and can confuse manual testing if not managed intentionally.
4. Frontend bundle size warning (>500 kB chunk) exists (non-blocking for this phase).
---

## 13) Approved unblock + final validation (Option 2)

User approved one-time explicit stop of exact process:
- Allowed PID: `36932`
- Reason: occupied port 8000 and blocked NEW APP `dev:all`

Execution:
1. Re-check before stop:
   - `netstat -ano | findstr :8000` showed LISTENING on PID `36932`.
   - Process details matched approved command (`node.exe` Cursor helper `server.mjs`).
2. Stopped exactly PID `36932` one time by explicit approval.
3. Re-check after stop:
   - Port 8000 became free.

### Final `npm run dev:all` result

From `F:\APPs`:
- `npm run dev:all` completed startup flow successfully:
  - frontend install check: pass
  - frontend build: pass
  - backend venv/install: pass
  - port 8000 check: pass
  - backend started on `http://127.0.0.1:8000`

### Port 8000 final owner

- Final owner PID: `19132`
- Process: `python.exe`
- Command: `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload`

### Health final result

- `GET http://127.0.0.1:8000/api/health`: success
- Payload:
  - status: `ok`
  - app: `VCPMC_NEW_APP`
  - api: `new-backend`
  - database: `vcpmc_contract_new_clone_20260509`

### Login + /api/me final result

- `POST http://127.0.0.1:8000/api/auth/login`: success
- `GET http://127.0.0.1:8000/api/me` with bearer token: success
- Token and password hash were not recorded in this report.

### Frontend served by FastAPI on 8000

- `GET http://127.0.0.1:8000/`: HTTP 200
- Returned built SPA HTML with `/assets/...` references.

### Runtime DB safety checks

- Backend guard remains strict to clone DB (`5433` + `vcpmc_contract_new_clone_20260509`).
- Runtime socket check:
  - no connection from backend runtime to DB port `5432`
  - backend server process observed using `5433`

### Old app safety confirmation

- Old app path `F:\VCPMC\APPS\contract` was not modified in this phase.
- No command was run to modify old app or old DB.

### Remaining risks

1. `--reload` mode uses reloader parent + worker process; monitoring tools should account for both PIDs.
2. Port 8000 can be occupied again by external tools; current guard will stop safely instead of killing unknown process.
3. Frontend bundle size warning remains non-blocking.

## 14) Auto-open browser update

File changed:
- `F:\APPs\scripts\dev-all.ps1`

What was added:
- Health readiness watcher (background PowerShell job) starts before uvicorn.
- Watcher polls `http://127.0.0.1:8000/api/health` for up to 30 seconds.
- On health success (`status=ok`), watcher runs:
  - `Start-Process "http://127.0.0.1:8000"`
- Timeout behavior:
  - after 30 seconds, prints clear warning that server is not ready.

Double-open prevention:
- Marker file used: `%TEMP%\\vcpmc-new-app-browser-opened-8000.flag`
- Marker is deleted at the beginning of each fresh `dev:all` run.
- Watcher creates marker immediately after opening browser.
- If marker exists, watcher exits without opening additional tab.

Validation result:
- Ran `npm run dev:all` from `F:\APPs`.
- Frontend build/install: OK.
- Backend started on `127.0.0.1:8000`: OK.
- `/api/health` returned `ok` with DB `vcpmc_contract_new_clone_20260509`: OK.
- Marker file was created: confirms auto-open action executed once.
- Runtime logs show serving from FastAPI on 8000 (`GET /`, assets, `/api/*`): OK.
- Old app untouched, DB untouched in this update.
