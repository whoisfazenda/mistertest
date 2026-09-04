"""Platega payment provider.

Docs: https://docs.platega.io
"""
from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

import httpx

from app.core.config import settings
from app.core.enums import PaymentStatus
from app.core.logging import get_logger
from app.services.payments.base import PaymentProvider, PaymentResult, WebhookResult

logger = get_logger(__name__)


class PlategaError(Exception):
    """Raised when Platega returns an error or a malformed response."""


# Mapping internal payment method codes to Platega PaymentMethodInt
# 2: СБП (QR-код)
# 11: Карточный эквайринг (Карты РФ: МИР, Сбер, Т-Банк)
# 12: Международная оплата
# 13: Криптовалюта (USDT, TON, BTC и др.)
# 14: Sberpay
METHOD_MAP: dict[str, int] = {
    "sbp": 2,
    "platega_sbp": 2,
    "card": 11,
    "bank_card": 11,
    "platega_card": 11,
    "intl_card": 12,
    "international": 12,
    "crypto": 13,
    "platega_crypto": 13,
    "sberpay": 14,
    "platega_sberpay": 14,
}


def _map_status(raw: str | None) -> PaymentStatus:
    if not raw:
        return PaymentStatus.PENDING
    status = raw.upper().strip()
    if status == "CONFIRMED":
        return PaymentStatus.SUCCEEDED
    if status in {"CANCELED", "CANCELLED", "FAILED"}:
        return PaymentStatus.FAILED
    if status == "CHARGEBACKED":
        return PaymentStatus.CANCELED
    return PaymentStatus.PENDING


def _header(headers: dict[str, str], name: str) -> str:
    target = name.lower().replace("-", "")
    for k, v in headers.items():
        if k.lower().replace("-", "") == target:
            return v.strip()
    return ""


class PlategaProvider(PaymentProvider):
    name = "platega"

    def __init__(
        self,
        *,
        base_url: str | None = None,
        merchant_id: str | None = None,
        secret: str | None = None,
        timeout: float | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = (base_url or settings.platega_base_url).rstrip("/")
        self.merchant_id = (
            merchant_id if merchant_id is not None else settings.platega_merchant_id
        ).strip()
        self.secret = (secret if secret is not None else settings.platega_secret).strip()
        self.timeout = timeout or settings.platega_timeout
        self.transport = transport

    async def create_payment(
        self,
        *,
        order_uuid: str,
        amount: float,
        currency: str,
        description: str,
        idempotency_key: str,
        payment_method: str | None = None,
    ) -> PaymentResult:
        if not self.merchant_id or not self.secret:
            raise PlategaError("PLATEGA_MERCHANT_ID or PLATEGA_SECRET is not configured")

        method_int: int | None = None
        if payment_method:
            clean_method = payment_method.lower().strip()
            if clean_method.isdigit():
                method_int = int(clean_method)
            else:
                method_int = METHOD_MAP.get(clean_method)

        return_url = settings.platega_success_redirect_url or "https://t.me/misterfvpn_bot"
        failed_url = settings.platega_fail_redirect_url or "https://t.me/misterfvpn_bot"

        amt = float(Decimal(str(amount)).quantize(Decimal("0.01")))

        payload: dict[str, Any] = {
            "paymentDetails": {
                "amount": amt,
                "currency": (currency or "RUB").upper(),
            },
            "description": description[:128] if description else f"Оплата заказа #{order_uuid[:8]}",
            "return": return_url,
            "failedUrl": failed_url,
            "payload": order_uuid,
        }

        if method_int is not None:
            payload["paymentMethod"] = method_int
            endpoint = "/transaction/process"
        else:
            endpoint = "/transaction/create"

        logger.info(
            "Creating Platega payment for order %s (amount: %s %s, method: %s)",
            order_uuid,
            amt,
            currency,
            method_int or "all",
        )

        data = await self._request("POST", endpoint, json=payload)

        transaction_id = str(data.get("transactionId") or data.get("id") or "")
        redirect_url = str(data.get("redirect") or data.get("url") or "")

        if not transaction_id or not redirect_url:
            raise PlategaError(
                f"Platega API did not return transactionId/redirect: {data}"
            )

        return PaymentResult(
            payment_id=transaction_id,
            confirmation_url=redirect_url,
            status=_map_status(data.get("status")),
            raw=data,
        )

    async def get_payment_status(self, payment_id: str) -> PaymentStatus:
        if not payment_id:
            return PaymentStatus.PENDING

        data = await self._request("GET", f"/transaction/{payment_id}")
        raw_status = data.get("status")
        return _map_status(raw_status)

    async def handle_webhook(self, raw_body: bytes, headers: dict[str, str]) -> WebhookResult:
        req_merchant = _header(headers, "x-merchantid")
        req_secret = _header(headers, "x-secret")

        if self.merchant_id and req_merchant and req_merchant != self.merchant_id:
            raise PlategaError(f"Platega webhook merchant ID mismatch: {req_merchant}")

        if self.secret and req_secret and req_secret != self.secret:
            raise PlategaError("Platega webhook secret mismatch")

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise PlategaError(f"Malformed JSON in Platega webhook: {exc}") from exc

        payment_id = str(payload.get("id") or payload.get("transactionId") or "")
        if not payment_id:
            raise PlategaError("Platega webhook payload missing transaction id")

        status_str = payload.get("status")
        order_uuid = str(payload.get("payload") or "").strip() or None

        return WebhookResult(
            payment_id=payment_id,
            status=_map_status(status_str),
            order_uuid=order_uuid,
            event_type="payment.status_changed",
            raw=payload,
        )

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        req_headers = kwargs.pop("headers", {}) or {}
        req_headers.setdefault("X-MerchantId", self.merchant_id)
        req_headers.setdefault("X-Secret", self.secret)
        req_headers.setdefault("Content-Type", "application/json")
        req_headers.setdefault("Accept", "application/json")

        async with httpx.AsyncClient(
            timeout=self.timeout, transport=self.transport
        ) as client:
            try:
                response = await client.request(
                    method, url, headers=req_headers, **kwargs
                )
            except httpx.RequestError as exc:
                raise PlategaError(f"Platega request failed ({url}): {exc}") from exc

        if response.status_code >= 400:
            try:
                err_data = response.json()
            except Exception:
                err_data = response.text
            raise PlategaError(
                f"Platega HTTP {response.status_code}: {err_data}"
            )

        try:
            return response.json()
        except Exception as exc:
            raise PlategaError(
                f"Platega non-JSON response ({response.status_code}): {response.text[:200]}"
            ) from exc
