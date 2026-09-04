"""Payment provider factory.

A single shared instance is returned per provider name so in-memory state of
the mock provider survives across handler calls within one process.
"""
from __future__ import annotations

from functools import lru_cache

from app.core.config import settings
from app.services.payments.base import PaymentProvider
from app.services.payments.mock import MockPaymentProvider
from app.services.payments.platega import PlategaProvider
from app.services.payments.rollypay import RollyPayProvider
from app.services.payments.yookassa import YooKassaProvider


@lru_cache
def get_payment_provider(provider_name: str | None = None) -> PaymentProvider:
    raw = (provider_name or settings.payment_provider or "platega").lower().strip()
    if provider_name is None and raw == "rollypay":
        raw = "platega"
    if raw == "mock":
        return MockPaymentProvider()
    if raw == "platega":
        return PlategaProvider()
    if raw == "rollypay":
        return RollyPayProvider()
    if raw == "yookassa":
        return YooKassaProvider()
    raise ValueError(
        f"Unknown PAYMENT_PROVIDER='{raw}'. Available: mock, platega, rollypay, yookassa."
    )
