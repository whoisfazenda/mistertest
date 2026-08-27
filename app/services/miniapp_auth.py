"""Telegram Mini App init-data validation and local preview identity."""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl

from fastapi import HTTPException, Request, status

from app.core.config import settings


MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60
_LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
_PUBLIC_PROXY_HEADERS = {
    "forwarded",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-localtunnel-agent-ips",
    "cf-connecting-ip",
    "cf-visitor",
}


@dataclass(frozen=True, slots=True)
class MiniAppIdentity:
    telegram_id: int
    username: str | None
    first_name: str | None
    language_code: str
    is_admin: bool
    is_local_preview: bool = False


def validate_telegram_init_data(
    init_data: str,
    bot_token: str,
    *,
    now: int | None = None,
    max_age_seconds: int = MAX_INIT_DATA_AGE_SECONDS,
) -> MiniAppIdentity:
    """Validate Telegram WebApp initData using Telegram's HMAC scheme."""
    if not init_data or not bot_token:
        raise ValueError("Telegram init data is missing")

    values = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = values.pop("hash", "")
    if not received_hash:
        raise ValueError("Telegram init data hash is missing")

    data_check_string = "\n".join(
        f"{key}={value}" for key, value in sorted(values.items())
    )
    secret_key = hmac.new(
        b"WebAppData",
        bot_token.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    expected_hash = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(received_hash.lower(), expected_hash.lower()):
        raise ValueError("Telegram init data signature is invalid")

    try:
        auth_date = int(values.get("auth_date", "0"))
    except ValueError as exc:
        raise ValueError("Telegram auth date is invalid") from exc
    current_time = int(time.time()) if now is None else now
    if auth_date <= 0 or auth_date > current_time + 300:
        raise ValueError("Telegram auth date is invalid")
    if current_time - auth_date > max_age_seconds:
        raise ValueError("Telegram init data has expired")

    try:
        user_data = json.loads(values.get("user", "{}"))
        telegram_id = int(user_data["id"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise ValueError("Telegram user is missing from init data") from exc

    return MiniAppIdentity(
        telegram_id=telegram_id,
        username=_clean_optional(user_data.get("username")),
        first_name=_clean_optional(user_data.get("first_name")),
        language_code=_clean_optional(user_data.get("language_code")) or "ru",
        is_admin=settings.is_admin(telegram_id),
    )


async def get_miniapp_identity(request: Request) -> MiniAppIdentity:
    """FastAPI dependency for authenticated Mini App API calls.

    A no-initData preview is allowed only on a literal localhost URL while
    DEV_MODE is enabled. Public tunnels and production hosts must always send
    signed Telegram initData, even when DEV_MODE accidentally remains enabled.
    """
    authorization = request.headers.get("authorization", "")
    init_data = request.headers.get("x-telegram-init-data", "")
    if authorization.lower().startswith("tma "):
        init_data = authorization[4:].strip()

    if init_data:
        try:
            token = settings.miniapp_bot_token or settings.bot_token
            return validate_telegram_init_data(init_data, token)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=str(exc),
            ) from exc

    if settings.dev_mode and _is_literal_local_preview_request(request):
        raw_id = request.headers.get("x-dev-telegram-id", "").strip()
        if not raw_id:
            raw_id = str(settings.admin_ids[0] if settings.admin_ids else 1)
        try:
            telegram_id = int(raw_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid local preview user") from exc
        return MiniAppIdentity(
            telegram_id=telegram_id,
            username="local_preview",
            first_name="Mister",
            language_code="ru",
            is_admin=settings.is_admin(telegram_id),
            is_local_preview=True,
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Open this Mini App from Telegram",
    )


def _clean_optional(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def _is_literal_local_preview_request(request: Request) -> bool:
    hostname = (request.url.hostname or "").lower()
    if hostname not in _LOCAL_HOSTS:
        return False
    return not any(header in request.headers for header in _PUBLIC_PROXY_HEADERS)
