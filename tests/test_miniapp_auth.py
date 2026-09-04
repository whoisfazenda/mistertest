"""Telegram Mini App signature validation tests."""
from __future__ import annotations

import hashlib
import hmac
import json
from urllib.parse import urlencode

import pytest
from starlette.datastructures import Headers, URL

from app.services.miniapp_auth import (
    _is_literal_local_preview_request,
    validate_telegram_init_data,
)


def _signed_init_data(token: str, *, auth_date: int = 1_700_000_000) -> str:
    values = {
        "auth_date": str(auth_date),
        "query_id": "AAHdF6IQAAAAAN0XohDhrOrc",
        "user": json.dumps(
            {
                "id": 424242,
                "first_name": "Mister",
                "username": "mistervpn",
                "language_code": "ru",
            },
            separators=(",", ":"),
            ensure_ascii=False,
        ),
    }
    check = "\n".join(f"{key}={value}" for key, value in sorted(values.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    values["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(values)


def test_valid_telegram_init_data() -> None:
    identity = validate_telegram_init_data(
        _signed_init_data("123:test"),
        "123:test",
        now=1_700_000_100,
    )

    assert identity.telegram_id == 424242
    assert identity.username == "mistervpn"
    assert identity.first_name == "Mister"


def test_rejects_tampered_telegram_init_data() -> None:
    init_data = _signed_init_data("123:test").replace("mistervpn", "attacker")

    with pytest.raises(ValueError, match="signature"):
        validate_telegram_init_data(init_data, "123:test", now=1_700_000_100)


def test_rejects_expired_telegram_init_data() -> None:
    with pytest.raises(ValueError, match="expired"):
        validate_telegram_init_data(
            _signed_init_data("123:test"),
            "123:test",
            now=1_700_100_000,
        )


def test_local_preview_rejects_public_tunnel_headers() -> None:
    class RequestStub:
        url = URL("http://127.0.0.1:8091/miniapp/api/bootstrap")
        headers = Headers({"x-localtunnel-agent-ips": '["203.0.113.10"]'})

    assert not _is_literal_local_preview_request(RequestStub())
