from __future__ import annotations

import logging
import os
import sys
from datetime import datetime
from pathlib import Path

# Reconfigure stdout/stderr to UTF-8 to avoid charmap errors on Windows
# when debug print() statements include Vietnamese characters.
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware as _CORSMiddleware

from .api.auth import router as auth_router
from .api.audit import router as audit_router
from .api.background import router as background_router
from .api.certificates import router as certificates_router
from .api.contracts import router as contracts_router
from .api.dev_auth import router as dev_auth_router
from .api.health import router as health_router
from .api.me import router as me_router
from .api.roles import router as roles_router
from .api.reports import router as reports_router
from .api.reports_v2 import kpi_router as kpi_router_v2, reports_v2_router
from .api.kpi_field import router as kpi_field_router
from .api.users import router as users_router
from .api.import_excel import router as import_router
from .api.bookmarklet_drafts import router as bookmarklet_drafts_router
from .api.dispatches import router as dispatches_router, download_router as dispatches_download_router
from .api.deployment import router as deployment_router
from .core.config import settings
from .core.database import startup_database_guard


class CORSMiddleware(_CORSMiddleware):
    """Extended CORS middleware that dynamically allows the active tunnel origin."""

    async def validate_origin(self, request: Request) -> bool:
        origin = request.headers.get("origin")
        if not origin:
            return True

        # Always allow hardcoded origins (localhost dev, etc.)
        if origin in self.allow_origins:
            return True

        # Allow tunnel origin dynamically when tunnel is running.
        try:
            from .services.quick_tunnel_manager import tunnel_manager
            info = tunnel_manager.get_status()
            if info.url and origin.startswith("https://"):
                # Strip trailing path to get just the origin
                from urllib.parse import urlparse
                tunnel_origin = f"{urlparse(info.url).scheme}://{urlparse(info.url).netloc}"
                if origin == tunnel_origin:
                    return True
        except Exception:
            pass

        return False


app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(me_router)
app.include_router(contracts_router)
app.include_router(certificates_router)
app.include_router(dev_auth_router)
app.include_router(background_router)
app.include_router(users_router)
app.include_router(roles_router)
app.include_router(reports_router)
app.include_router(reports_v2_router)
app.include_router(kpi_router_v2)
app.include_router(kpi_field_router)
app.include_router(audit_router)
app.include_router(import_router)
app.include_router(dispatches_router)
app.include_router(dispatches_download_router)
app.include_router(deployment_router)


_FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
_INDEX_FILE = _FRONTEND_DIST / "index.html"


@app.on_event("startup")
def on_startup() -> None:
    app.state.current_database = startup_database_guard()
    app.state.db_mode = os.getenv("DB_MODE", "main").strip().lower()
    # #region agent log
    try:
        from pathlib import Path
        import socket
        pid = os.getpid()
        log_path = Path(r"F:\APPs\debug-c968d0.log")
        with log_path.open("a", encoding="utf-8") as fh:
            fh.write(
                '{"id":"log_startup_' + str(pid) + '","timestamp":' + str(int(datetime.now().timestamp() * 1000)) + ',"location":"backend/app/main.py:on_startup","message":"backend restarted, pid bound to :8000","data":{"pid":' + str(pid) + ',"port":8000,"hostname":"' + socket.gethostname() + '"},"hypothesisId":"STARTUP"}\n'
            )
    except Exception:
        pass
    # #endregion


@app.get("/", include_in_schema=False)
def root_index():
    if _INDEX_FILE.exists():
        return FileResponse(_INDEX_FILE)
    return JSONResponse(
        {
            "status": "not_ready",
            "message": "Frontend build not found. Run npm run dev:all from F:\\APPs.",
        },
        status_code=503,
    )


@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str):
    if full_path.startswith("api"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)

    candidate = (_FRONTEND_DIST / full_path).resolve()
    if _FRONTEND_DIST.exists() and candidate.exists() and candidate.is_file() and _FRONTEND_DIST in candidate.parents:
        return FileResponse(candidate)

    if _INDEX_FILE.exists():
        return FileResponse(_INDEX_FILE)

    return JSONResponse(
        {
            "status": "not_ready",
            "message": "Frontend build not found. Run npm run dev:all from F:\\APPs.",
        },
        status_code=503,
    )
