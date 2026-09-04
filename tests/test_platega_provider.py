"""Platega payment provider tests."""
from __future__ import annotations

import json
import httpx
import pytest

from app.core.enums import PaymentStatus
from app.services.payments.platega import PlategaError, PlategaProvider


@pytest.mark.asyncio
async def test_platega_create_payment_sbp() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["merchant_id"] = request.headers.get("X-MerchantId")
        seen["secret"] = request.headers.get("X-Secret")
        seen["body"] = json.loads(request.content.decode("utf-8"))
        return httpx.Response(
            200,
            json={
                "paymentMethod": "SBPQR",
                "transactionId": "3fa85f64-5717-4562-b3fc-2c463f66afa6",
                "redirect": "https://pay.platega.io?qrsbp",
                "status": "PENDING",
            },
        )

    provider = PlategaProvider(
        base_url="https://app.platega.io",
        merchant_id="merchant-uuid-123",
        secret="secret-api-key-456",
        transport=httpx.MockTransport(handler),
    )

    result = await provider.create_payment(
        order_uuid="order-123",
        amount=250.0,
        currency="RUB",
        description="Подписка на VPN",
        idempotency_key="idem-1",
        payment_method="sbp",
    )

    assert result.payment_id == "3fa85f64-5717-4562-b3fc-2c463f66afa6"
    assert result.confirmation_url == "https://pay.platega.io?qrsbp"
    assert result.status == PaymentStatus.PENDING
    assert seen["path"] == "/transaction/process"
    assert seen["merchant_id"] == "merchant-uuid-123"
    assert seen["secret"] == "secret-api-key-456"
    body = seen["body"]
    assert isinstance(body, dict)
    assert body["paymentMethod"] == 2  # SBP method in Platega
    assert body["paymentDetails"]["amount"] == 250.0
    assert body["payload"] == "order-123"


@pytest.mark.asyncio
async def test_platega_create_payment_card_and_crypto() -> None:
    seen_methods: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        seen_methods.append(body.get("paymentMethod"))
        return httpx.Response(
            200,
            json={
                "paymentMethod": "CARD",
                "transactionId": "tx-1",
                "redirect": "https://pay.platega.io/card",
                "status": "PENDING",
            },
        )

    provider = PlategaProvider(
        merchant_id="m-1",
        secret="s-1",
        transport=httpx.MockTransport(handler),
    )

    # Card
    await provider.create_payment(
        order_uuid="order-card",
        amount=100.0,
        currency="RUB",
        description="Card payment",
        idempotency_key="idem-card",
        payment_method="card",
    )
    # Crypto
    await provider.create_payment(
        order_uuid="order-crypto",
        amount=100.0,
        currency="RUB",
        description="Crypto payment",
        idempotency_key="idem-crypto",
        payment_method="crypto",
    )

    assert seen_methods == [11, 13]  # 11 = Card, 13 = Crypto


@pytest.mark.asyncio
async def test_platega_get_payment_status() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/transaction/tx-999"
        return httpx.Response(
            200,
            json={
                "id": "tx-999",
                "status": "CONFIRMED",
            },
        )

    provider = PlategaProvider(
        merchant_id="m-1",
        secret="s-1",
        transport=httpx.MockTransport(handler),
    )
    status = await provider.get_payment_status("tx-999")
    assert status == PaymentStatus.SUCCEEDED


@pytest.mark.asyncio
async def test_platega_handle_webhook_success() -> None:
    provider = PlategaProvider(
        merchant_id="merchant-123",
        secret="secret-456",
    )

    body = json.dumps({
        "id": "3fa85f64-5717-4562-b3fc-2c463f66afa6",
        "amount": 500,
        "currency": "RUB",
        "status": "CONFIRMED",
        "paymentMethod": 2,
        "payload": "order-uuid-abc",
    }).encode("utf-8")

    headers = {
        "X-MerchantId": "merchant-123",
        "X-Secret": "secret-456",
    }

    result = await provider.handle_webhook(body, headers)
    assert result.payment_id == "3fa85f64-5717-4562-b3fc-2c463f66afa6"
    assert result.status == PaymentStatus.SUCCEEDED
    assert result.order_uuid == "order-uuid-abc"


@pytest.mark.asyncio
async def test_platega_handle_webhook_invalid_secret() -> None:
    provider = PlategaProvider(
        merchant_id="merchant-123",
        secret="secret-456",
    )

    body = json.dumps({"id": "tx-1", "status": "CONFIRMED"}).encode("utf-8")
    headers = {
        "X-MerchantId": "merchant-123",
        "X-Secret": "wrong-secret",
    }

    with pytest.raises(PlategaError, match="secret mismatch"):
        await provider.handle_webhook(body, headers)


@pytest.mark.asyncio
async def test_platega_webhook_endpoint_get() -> None:
    from app.main_api import create_app

    app = create_app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/webhooks/platega")
        assert response.status_code == 200
        assert "Platega" in response.text


def test_miniapp_payment_config_routes_to_platega() -> None:
    from app.api.routes.miniapp import _payment_config

    assert _payment_config("crypto") == ("platega", "crypto", "Криптовалюта (Platega)")
    assert _payment_config("platega_crypto") == ("platega", "crypto", "Криптовалюта (Platega)")
    assert _payment_config("xrocket") == ("platega", "crypto", "Криптовалюта (Platega)")
    assert _payment_config("cryptobot") == ("platega", "crypto", "Криптовалюта (Platega)")
    assert _payment_config("sbp") == ("platega", "sbp", "СБП (Platega)")
    assert _payment_config("platega_sbp") == ("platega", "sbp", "СБП (Platega)")
    assert _payment_config("card") == ("platega", "card", "Банковская карта (Platega)")
    assert _payment_config("platega_card") == ("platega", "card", "Банковская карта (Platega)")
    assert _payment_config("anything_else") == ("platega", None, "Platega")


def test_bot_provider_for_payment_method_routes_to_platega() -> None:
    from app.bot.handlers.buy import _provider_for_payment_method, _provider_payment_method

    for m in ["crypto", "platega_crypto", "sbp", "platega_sbp", "card", "platega_card", "xrocket", "cryptobot"]:
        assert _provider_for_payment_method(m) == "platega"
        assert _provider_payment_method(m) in {"crypto", "sbp", "card"}



