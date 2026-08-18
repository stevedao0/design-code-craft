from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ENV_PATH = _BACKEND_ROOT / ".env"
# Only load backend/.env for local dev — in Docker/production, env vars come
# from env_file in docker-compose.prod.yml and must not be overridden.
if _ENV_PATH.exists() and os.getenv("APP_ENV") != "production":
    load_dotenv(_ENV_PATH, override=True)


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_instance: str
    app_env: str
    db_mode: str
    node_env: str
    dev_auth_enabled: bool
    create_contract_write_enabled: bool
    create_contract_rollback_only: bool
    create_contract_persist_test_only: bool
    create_contract_clone_only_enabled: bool
    update_contract_clone_only_enabled: bool
    update_contract_main_db_enabled: bool
    create_certificate_write_enabled: bool
    create_certificate_draft_only_enabled: bool
    create_certificate_clone_only_enabled: bool
    assign_certificate_number_enabled: bool
    assign_certificate_number_clone_only_enabled: bool
    update_certificate_enabled: bool
    update_certificate_clone_only_enabled: bool
    sync_certificate_enabled: bool
    sync_certificate_clone_only_enabled: bool
    print_certificate_enabled: bool
    print_certificate_clone_only_enabled: bool
    admin_delete_final_certificate_main_db_enabled: bool
    export_template_root: str
    export_output_root: str
    preview_storage_path: str
    export_render_enabled: bool
    export_db_attach_enabled: bool
    # When true, create-and-export-docx writes per-request debug entries to
    # debug-390525.log in the working directory. Default false (off).
    # Enable only when actively debugging the create flow.
    debug_contract_create: bool
    database_url: str
    jwt_secret_key: str
    jwt_algorithm: str
    access_token_expire_minutes: int
    cors_allowed_origins: list[str]


def _parse_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def get_settings() -> Settings:
    return Settings(
        app_name=os.getenv("APP_NAME", "VCPMC_NEW_APP"),
        app_instance=os.getenv("APP_INSTANCE", "new-app"),
        app_env=os.getenv("APP_ENV", os.getenv("ENV", "development")),
        db_mode=os.getenv("DB_MODE", "main"),
        node_env=os.getenv("NODE_ENV", ""),
        dev_auth_enabled=_parse_bool(os.getenv("DEV_AUTH_ENABLED", "false")),
        create_contract_write_enabled=_parse_bool(os.getenv("CREATE_CONTRACT_WRITE_ENABLED", "false")),
        create_contract_rollback_only=_parse_bool(os.getenv("CREATE_CONTRACT_ROLLBACK_ONLY", "true")),
        create_contract_persist_test_only=_parse_bool(os.getenv("CREATE_CONTRACT_PERSIST_TEST_ONLY", "false")),
        create_contract_clone_only_enabled=_parse_bool(os.getenv("CREATE_CONTRACT_CLONE_ONLY_ENABLED", "false")),
        update_contract_clone_only_enabled=_parse_bool(os.getenv("UPDATE_CONTRACT_CLONE_ONLY_ENABLED", "false")),
        update_contract_main_db_enabled=_parse_bool(os.getenv("UPDATE_CONTRACT_MAIN_DB_ENABLED", "false")),
        create_certificate_write_enabled=_parse_bool(os.getenv("CREATE_CERTIFICATE_WRITE_ENABLED", "false")),
        create_certificate_draft_only_enabled=_parse_bool(os.getenv("CREATE_CERTIFICATE_DRAFT_ONLY_ENABLED", "false")),
        create_certificate_clone_only_enabled=_parse_bool(os.getenv("CREATE_CERTIFICATE_CLONE_ONLY_ENABLED", "false")),
        assign_certificate_number_enabled=_parse_bool(os.getenv("ASSIGN_CERTIFICATE_NUMBER_ENABLED", "false")),
        assign_certificate_number_clone_only_enabled=_parse_bool(os.getenv("ASSIGN_CERTIFICATE_NUMBER_CLONE_ONLY_ENABLED", "false")),
        update_certificate_enabled=_parse_bool(os.getenv("UPDATE_CERTIFICATE_ENABLED", "true")),
        update_certificate_clone_only_enabled=_parse_bool(os.getenv("UPDATE_CERTIFICATE_CLONE_ONLY_ENABLED", "true")),
        sync_certificate_enabled=_parse_bool(os.getenv("SYNC_CERTIFICATE_ENABLED", "true")),
        sync_certificate_clone_only_enabled=_parse_bool(os.getenv("SYNC_CERTIFICATE_CLONE_ONLY_ENABLED", "true")),
        print_certificate_enabled=_parse_bool(os.getenv("PRINT_CERTIFICATE_ENABLED", "true")),
        print_certificate_clone_only_enabled=_parse_bool(os.getenv("PRINT_CERTIFICATE_CLONE_ONLY_ENABLED", "true")),
        admin_delete_final_certificate_main_db_enabled=_parse_bool(os.getenv("ADMIN_DELETE_FINAL_CERTIFICATE_MAIN_DB_ENABLED", "false")),
        export_template_root=os.getenv("EXPORT_TEMPLATE_ROOT", r"F:\APPs\templates"),
        export_output_root=os.getenv("EXPORT_OUTPUT_ROOT", r"F:\APPs\storage"),
        preview_storage_path=os.getenv("PREVIEW_STORAGE_PATH", r"F:\APPs\storage\preview"),
export_render_enabled=_parse_bool(os.getenv("EXPORT_RENDER_ENABLED", "false")),
    export_db_attach_enabled=_parse_bool(os.getenv("EXPORT_DB_ATTACH_ENABLED", "false")),
    debug_contract_create=_parse_bool(os.getenv("DEBUG_CONTRACT_CREATE", "false")),
        database_url=os.getenv("DATABASE_URL", ""),
        jwt_secret_key=os.getenv("JWT_SECRET_KEY", "dev_only_change_later"),
        jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
        access_token_expire_minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480")),
        cors_allowed_origins=_parse_csv(
            os.getenv("CORS_ALLOWED_ORIGINS", "http://127.0.0.1:5199,http://localhost:5199")
        ),
    )


settings = get_settings()

# Log runtime config values on startup
import logging
_logger = logging.getLogger(__name__)
_logger.info(
    "[config] Runtime flags: DB_MODE=%s, UPDATE_CONTRACT_MAIN_DB_ENABLED=%s",
    settings.db_mode,
    settings.update_contract_main_db_enabled,
)
