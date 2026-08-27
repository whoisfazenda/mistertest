"""Formatting helper tests."""
from __future__ import annotations

from app.core.config import settings
from app.services.subscriptions import public_subscription_url, upstream_subscription_url
from app.utils.formatting import format_days, format_gb_used, format_price, format_traffic

GB = 1024 ** 3


def test_format_traffic_unlimited() -> None:
    assert format_traffic(None) == "безлимит"
    assert format_traffic(0) == "безлимит"
    assert format_traffic(-5) == "безлимит"


def test_format_traffic_gb() -> None:
    assert format_traffic(10 * GB) == "10.0 ГБ"
    assert format_traffic(150 * GB) == "150 ГБ"


def test_format_gb_used_unlimited() -> None:
    assert format_gb_used(5 * GB, None) == "безлимитный"
    assert format_gb_used(5 * GB, 0) == "безлимитный"


def test_format_gb_used_limited() -> None:
    assert format_gb_used(2 * GB, 10 * GB) == "2.0 ГБ из 10.0 ГБ"


def test_format_price_integer() -> None:
    assert format_price(100, "RUB") == "100 RUB"


def test_format_price_decimal() -> None:
    assert format_price(99.5, "RUB") == "99.50 RUB"


def test_format_price_none() -> None:
    assert format_price(None, "RUB") == "—"


def test_format_days() -> None:
    assert format_days(1) == "1 день"
    assert format_days(2) == "2 дня"
    assert format_days(5) == "5 дней"
    assert format_days(11) == "11 дней"
    assert format_days(21) == "21 день"


def test_public_subscription_url_uses_branded_https_port_until_configured(monkeypatch) -> None:
    monkeypatch.setattr(settings, "public_base_url", "")
    assert public_subscription_url("sub 123") == (
        "https://sub.misterv.localnode.app:20173/sub/sub%20123"
    )


def test_upstream_subscription_url_keeps_adaptgroup_fallback(monkeypatch) -> None:
    monkeypatch.setattr(settings, "public_base_url", "https://sub.misterv.localnode.app")
    monkeypatch.setattr(settings, "adaptgroup_base_url", "https://network-api.adaptgroup.app")
    public = "https://sub.misterv.localnode.app/sub/sub-123"
    assert upstream_subscription_url("sub-123", public) == (
        "https://network-api.adaptgroup.app/sub/sub-123"
    )
    direct = "https://network-api.adaptgroup.app/sub/sub-123"
    assert upstream_subscription_url("sub-123", direct) == direct
