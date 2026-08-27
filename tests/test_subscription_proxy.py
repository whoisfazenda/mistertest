"""Subscription proxy request forwarding tests."""
from __future__ import annotations

from app.api.routes.subscription_page import (
    _merge_query_params,
    _upstream_request_headers,
)


def test_forwards_vpn_client_device_headers() -> None:
    result = _upstream_request_headers(
        {
            "User-Agent": "Happ/1.0",
            "X-Hwid": "real-device-id",
            "X-Device-Id": "second-device-id",
            "Device-Id": "third-device-id",
            "Host": "sub.misterv.localnode.app:20173",
            "Authorization": "must-not-leak",
            "X-Forwarded-For": "203.0.113.10",
            "X-Api-Key": "must-not-leak",
        }
    )

    assert result["X-Hwid"] == "real-device-id"
    assert result["X-Device-Id"] == "second-device-id"
    assert result["Device-Id"] == "third-device-id"
    assert result["User-Agent"] == "Happ/1.0"
    assert "Host" not in result
    assert "Authorization" not in result
    assert "X-Forwarded-For" not in result
    assert "X-Api-Key" not in result


def test_preserves_device_query_parameters_and_existing_upstream_query() -> None:
    result = _merge_query_params(
        "https://network-api.adaptgroup.app/sub/uuid?source=bot",
        [("device_id", "abc 123"), ("app", "happ")],
    )

    assert result == (
        "https://network-api.adaptgroup.app/sub/uuid"
        "?source=bot&device_id=abc+123&app=happ"
    )
