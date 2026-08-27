"""Telegram Mini App UI and authenticated JSON API."""
from __future__ import annotations

import math
import csv
import io
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import asyncio
from pathlib import Path
from time import perf_counter
from typing import Annotated, Any, Awaitable, Literal, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Path as ApiPath, Query, Request
from fastapi.responses import Response, StreamingResponse
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from pydantic import BaseModel, Field
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.adaptgroup import _first
from app.core.config import settings
from app.core.enums import OrderStatus, OrderType, UserRole
from app.core.logging import get_logger
from app.db.database import get_session
from app.db.models.order import Order
from app.db.models.admin_operations import (
    AdminAuditLog,
    AdminCampaign,
    AdminTask,
    BroadcastTemplate,
)
from app.db.models.notification import UserNotification
from app.db.models.plan import VPNPlanSnapshot
from app.db.models.promo import PromoCode
from app.db.models.subscription import VPNSubscription
from app.db.models.support_ticket import SupportTicket
from app.db.models.user import User
from app.repositories.orders import OrderRepository
from app.repositories.plans import PlanRepository
from app.repositories.promos import PromoRepository
from app.repositories.subscriptions import SubscriptionRepository
from app.repositories.users import UserRepository
from app.services.miniapp_auth import MiniAppIdentity, get_miniapp_identity
from app.services.admin_operations import has_scope, is_admin_role, write_audit
from app.services.orders import OrderService
from app.services.payments.factory import get_payment_provider
from app.services.plans import PlanService
from app.services.subscriptions import SubscriptionService, public_subscription_url
from app.utils.idempotency import new_uuid

logger = get_logger(__name__)

router = APIRouter(tags=["miniapp"])
_STATIC_ROOT = Path(__file__).resolve().parents[2] / "miniapp" / "static"
_NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
    "X-Content-Type-Options": "nosniff",
}
# AdaptGroup is a third-party dependency: never let it hang a Mini App screen.
_UPSTREAM_TIMEOUT = 6.0
_T = TypeVar("_T")

# Broadcast progress lives in-process; the API runs as a single worker.
_broadcasts: dict[str, dict[str, Any]] = {}


class EnabledBody(BaseModel):
    enabled: bool


class PurchaseBody(BaseModel):
    plan_uuid: str = Field(min_length=1, max_length=128)
    payment_method: Literal["balance", "card", "sbp", "crypto", "xrocket", "cryptobot"] = "balance"


class GiftPurchaseBody(PurchaseBody):
    recipient: str = Field(min_length=2, max_length=64)


class PaymentMethodBody(BaseModel):
    payment_method: Literal["balance", "card", "sbp", "crypto", "xrocket", "cryptobot"] = "balance"


class CustomRenewBody(PaymentMethodBody):
    days: int = Field(ge=3, le=365)


class TopUpBody(BaseModel):
    amount: Decimal = Field(gt=0)
    payment_method: Literal["card", "sbp", "crypto", "xrocket", "cryptobot"] = "card"


class PromoBody(BaseModel):
    code: str = Field(min_length=2, max_length=64)


class PreferredPaymentBody(BaseModel):
    payment_method: Literal["balance", "card", "sbp", "crypto", "xrocket", "cryptobot"]


class SupportTicketBody(BaseModel):
    category: Literal["connection", "payment", "subscription", "other"] = "other"
    message: str = Field(min_length=10, max_length=2000)


class AdminBalanceBody(BaseModel):
    delta: Decimal
    confirm: bool = False


class AdminGrantBody(BaseModel):
    plan_uuid: str = Field(min_length=1, max_length=128)
    confirm: bool = False


class AdminBlockBody(EnabledBody):
    confirm: bool = False


class AdminPromoBody(BaseModel):
    code: str = Field(min_length=2, max_length=64)
    amount: Decimal | None = Field(default=None, gt=0)
    discount_value: Decimal | None = Field(default=None, gt=0)
    max_uses: int | None = Field(default=None, ge=1)
    max_usages: int | None = Field(default=None, ge=1)
    expires_in_days: int | None = Field(default=None, ge=1, le=3650)
    expires_days: int | None = Field(default=None, ge=1, le=3650)
    audience: Literal["all", "active", "new_users", "no_subscription"] = "all"
    per_user_limit: int = Field(default=1, ge=1, le=100)
    discount_type: str | None = None


class AdminPromoUpdateBody(BaseModel):
    amount: Decimal = Field(gt=0)
    max_uses: int | None = Field(default=None, ge=1)
    expires_in_days: int | None = Field(default=None, ge=1, le=3650)
    audience: Literal["all", "active", "new_users", "no_subscription"] = "all"
    per_user_limit: int = Field(default=1, ge=1, le=100)


class AdminExtendBody(BaseModel):
    days: int = Field(ge=3, le=365)
    notify: bool = True


class AdminPlanPriceBody(BaseModel):
    price: Decimal | None = Field(default=None, ge=0)


class AdminMessageBody(BaseModel):
    text: str = Field(min_length=1, max_length=3500)


class AdminBroadcastBody(AdminMessageBody):
    audience: Literal["all", "active", "expiring", "no_subscription"] = "all"
    image_url: str | None = Field(default=None, max_length=1000)
    button_text: str | None = Field(default=None, max_length=64)
    button_url: str | None = Field(default=None, max_length=1000)
    schedule_at: datetime | None = None
    template_name: str | None = Field(default=None, max_length=100)
    test_telegram_id: int | None = None
    dry_run: bool = False


class AdminConfirmBody(BaseModel):
    confirm: bool = False


class AdminUserUpdateBody(BaseModel):
    note: str | None = Field(default=None, max_length=4000)
    tags: list[str] = Field(default_factory=list, max_length=30)


class AdminRoleBody(BaseModel):
    role: Literal["owner", "support", "finance", "marketing", "admin", "user"]


class AdminCampaignBody(AdminMessageBody):
    name: str = Field(min_length=2, max_length=120)
    audience: Literal["all", "active", "expiring", "expiring_3d", "no_subscription", "no_subscription_3d", "inactive_30d", "failed_payment"] = "all"
    kind: Literal["manual", "automatic"] = "manual"
    trigger_type: str | None = Field(default=None, max_length=40)
    image_url: str | None = Field(default=None, max_length=1000)
    button_text: str | None = Field(default=None, max_length=64)
    button_url: str | None = Field(default=None, max_length=1000)
    schedule_at: datetime | None = None


class AdminTemplateBody(AdminMessageBody):
    name: str = Field(min_length=2, max_length=100)
    image_url: str | None = Field(default=None, max_length=1000)
    button_text: str | None = Field(default=None, max_length=64)
    button_url: str | None = Field(default=None, max_length=1000)


class AdminManualCompleteBody(AdminConfirmBody):
    subscription_uuid: str = Field(min_length=4, max_length=128)


class AdminTaskResolveBody(AdminConfirmBody):
    resolution: str | None = Field(default=None, max_length=1000)


@router.get("/", include_in_schema=False)
@router.get("/miniapp", include_in_schema=False)
@router.get("/miniapp/", include_in_schema=False)
@router.get("/pricing", include_in_schema=False)
@router.get("/devices", include_in_schema=False)
@router.get("/profile", include_in_schema=False)
@router.get("/admin", include_in_schema=False)
@router.get("/history", include_in_schema=False)
@router.get("/support", include_in_schema=False)
@router.get("/plan/{plan_uuid}", include_in_schema=False)
async def miniapp_index() -> Response:
    return _miniapp_static_response("index.html", "text/html")


@router.get("/miniapp/import", include_in_schema=False)
@router.get("/miniapp/import/{client}", include_in_schema=False)
async def miniapp_import_redirect(
    request: Request,
    client: str = "happ",
    url: str = Query(default=""),
    target: str | None = None,
) -> Response:
    app_type = (target or client or "happ").lower().strip()
    sub_url = url.strip()

    scheme_map = {
        "happ": f"happ://add/{sub_url}" if sub_url else "happ://",
        "karing": f"karing://install-config?url={sub_url}&name=MisterVPN" if sub_url else "karing://",
        "incy": f"incy://install-config?url={sub_url}&name=MisterVPN" if sub_url else "incy://",
        "v2raytun": f"v2raytun://import/{sub_url}" if sub_url else "v2raytun://",
        "hiddify": f"hiddify://import/{sub_url}" if sub_url else "hiddify://",
        "streisand": f"streisand://import/{sub_url}" if sub_url else "streisand://",
    }
    scheme_url = scheme_map.get(app_type, f"happ://add/{sub_url}")
    app_name = "Incy" if app_type == "incy" else "v2RayTun" if app_type == "v2raytun" else app_type.capitalize()

    # Alternative secondary schemes for Incy
    alt_scheme_1 = f"incy://add/{sub_url}" if app_type == "incy" else ""
    alt_scheme_2 = f"incy://import?url={sub_url}" if app_type == "incy" else ""

    html_content = f"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="0;url={scheme_url}">
  <title>Импорт в {app_name} — Mister VPN</title>
  <style>
    body {{
      margin: 0;
      padding: 24px 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #050507;
      color: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 90vh;
      text-align: center;
      box-sizing: border-box;
    }}
    .card {{
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 24px;
      padding: 32px 24px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
      backdrop-filter: blur(20px);
    }}
    h1 {{
      font-size: 22px;
      font-weight: 800;
      margin: 0 0 8px;
    }}
    p {{
      font-size: 14px;
      color: #a1a1aa;
      margin: 0 0 24px;
      line-height: 1.5;
    }}
    .btn {{
      display: block;
      width: 100%;
      box-sizing: border-box;
      padding: 14px 20px;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 700;
      text-decoration: none;
      margin-bottom: 12px;
      transition: all 0.2s;
      cursor: pointer;
    }}
    .btn-primary {{
      background: #ffffff;
      color: #000000;
      border: none;
      box-shadow: 0 0 24px rgba(255,255,255,0.25);
    }}
    .btn-secondary {{
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }}
    .downloads {{
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 12px;
      color: #71717a;
    }}
    .links {{
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-top: 10px;
    }}
    .link-pill {{
      display: inline-block;
      padding: 6px 12px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.06);
      color: #d4d4d8;
      text-decoration: none;
      font-size: 12px;
      font-weight: 600;
    }}
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 40px; margin-bottom: 12px;">⚡</div>
    <h1>Импорт в {app_name}</h1>
    <p>Если приложение не открылось автоматически за пару секунд, нажмите кнопку ниже:</p>
    
    <a href="{scheme_url}" class="btn btn-primary" id="launchBtn">🚀 Открыть {app_name}</a>
    {"<a href='" + alt_scheme_1 + "' class='btn btn-secondary'>⚡ Вариант запуска 2</a>" if alt_scheme_1 else ""}
    <button onclick="copySub()" class="btn btn-secondary" id="copyBtn">📋 Скопировать ссылку</button>
    
    <div class="downloads">
      <span>Нет приложения? Установите официальный клиент:</span>
      <div class="links">
        <a href="https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973" target="_blank" class="link-pill">Happ (iOS)</a>
        <a href="https://play.google.com/store/search?q=happ&c=apps&hl=ru" target="_blank" class="link-pill">Happ (Android)</a>
        <a href="https://apps.apple.com/app/incy/id6756943388" target="_blank" class="link-pill">Incy (iOS)</a>
        <a href="https://play.google.com/store/apps/details?id=llc.itdev.incy" target="_blank" class="link-pill">Incy (Android)</a>
        <a href="https://www.happ.su/main/ru" target="_blank" class="link-pill">Windows (PC)</a>
      </div>
    </div>
  </div>

  <script>
    const subUrl = "{sub_url}";
    const scheme = "{scheme_url}";
    
    // Auto launch
    window.location.href = scheme;
    
    function copySub() {{
      if (navigator.clipboard && subUrl) {{
        navigator.clipboard.writeText(subUrl).then(() => {{
          const b = document.getElementById('copyBtn');
          b.innerText = '✅ Ссылка скопирована!';
          setTimeout(() => {{ b.innerText = '📋 Скопировать ссылку'; }}, 2500);
        }}).catch(() => {{
          prompt('Скопируйте ссылку подписки:', subUrl);
        }});
      }} else {{
        prompt('Скопируйте ссылку подписки:', subUrl);
      }}
    }}
  </script>
</body>
</html>"""
    return Response(content=html_content, media_type="text/html", headers={"Cache-Control": "no-store"})


@router.get("/miniapp/static/styles.css", include_in_schema=False)
async def miniapp_styles() -> Response:
    return _miniapp_static_response("styles.css", "text/css")


@router.get("/miniapp/static/app.js", include_in_schema=False)
async def miniapp_script() -> Response:
    return _miniapp_static_response("app.js", "text/javascript")


@router.get("/miniapp/api/bootstrap")
async def miniapp_bootstrap(
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    sub = await SubscriptionRepository(session).get_active_for_user(user.id)
    devices: list[dict[str, Any]] = []
    service_online = True
    sub_service = SubscriptionService(session, request.app.state.adaptgroup_client)
    if sub is not None:
        try:
            sub = await asyncio.wait_for(sub_service.refresh_from_api(sub), timeout=1.8)
            devices = await asyncio.wait_for(sub_service.get_devices(sub), timeout=1.8)
        except Exception:
            service_online = True

    plan_service = PlanService(session, request.app.state.adaptgroup_client)
    plans = await plan_service.repo.list_active(include_trial=False, public_only=True)
    if not plans:
        try:
            plans = await asyncio.wait_for(plan_service.get_purchasable_plans(auto_sync=True), timeout=2.5)
        except Exception:
            plans = await plan_service.repo.list_active(include_trial=False, public_only=True)
    orders = await OrderRepository(session).list_for_user(user.id, limit=12)
    trial_plan = None if user.trial_claimed or sub is not None else await _find_trial_plan(session)
    await _sync_user_notifications(
        session,
        user,
        sub,
        devices,
        service_online=service_online,
    )
    notifications = await _list_user_notifications(session, user.id, limit=20)
    await session.commit()
    return {
        "user": _serialize_user(user, identity),
        "subscription": _serialize_subscription(sub, devices) if sub else None,
        "devices": [_serialize_device(item) for item in devices],
        "plans": [_serialize_plan(plan) for plan in plans],
        "orders": [_serialize_order(order) for order in orders],
        "notifications": [_serialize_notification(item) for item in notifications],
        "notification_unread": sum(1 for item in notifications if item.read_at is None),
        "service": {"online": service_online, "message": service_error},
        "trial": _serialize_trial_offer(trial_plan),
        "config": {
            "support_url": settings.support_url,
            "currency": settings.currency,
            "min_topup": float(settings.min_balance_topup),
            "max_topup": float(settings.max_balance_topup),
            "local_preview": identity.is_local_preview,
            "server_selection_supported": False,
            "server_mode": "automatic",
        },
    }


@router.post("/miniapp/api/trial/claim")
async def claim_trial(
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Activate the one-time free trial without leaving the Mini App."""
    user = await _current_user(session, identity)
    if user.trial_claimed:
        raise HTTPException(400, "Пробный период уже был активирован")
    existing = await SubscriptionRepository(session).get_active_for_user(user.id)
    if existing is not None:
        raise HTTPException(400, "У вас уже есть подписка")
    plan = await _find_trial_plan(session)
    if plan is None:
        raise HTTPException(404, "Пробный период сейчас недоступен")

    service = OrderService(
        session,
        request.app.state.adaptgroup_client,
        get_payment_provider(),
    )
    order = await service.create_free_trial_order(user.id, plan.plan_uuid)
    outcome = await service.provision(order)
    if not (outcome.provisioned or outcome.already_done):
        raise HTTPException(502, outcome.error or "Не удалось активировать пробный период")
    user.trial_claimed = True
    await session.commit()
    return {"ok": True, "plan_name": plan.name, "days": plan.duration_days}


@router.post("/miniapp/api/subscription/refresh")
async def refresh_subscription(
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    sub = await _require_subscription(session, user)
    service = SubscriptionService(session, request.app.state.adaptgroup_client)
    await _upstream(service.refresh_from_api(sub))
    devices = await _upstream(service.get_devices(sub))
    return {
        "subscription": _serialize_subscription(sub, devices),
        "devices": [_serialize_device(item) for item in devices],
    }


@router.post("/miniapp/api/subscription/freeze")
async def toggle_subscription_freeze(
    body: EnabledBody,
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    sub = await _require_subscription(session, user)
    service = SubscriptionService(session, request.app.state.adaptgroup_client)
    if body.enabled and not sub.is_frozen:
        await _upstream(service.freeze(sub))
    elif not body.enabled and sub.is_frozen:
        await _upstream(service.unfreeze(sub))
    return {"ok": True, "is_frozen": sub.is_frozen}


@router.post("/miniapp/api/subscription/auto-renew")
async def toggle_auto_renew(
    body: EnabledBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    sub = await _require_subscription(session, user)
    if body.enabled and (sub.is_trial or not sub.plan_uuid):
        raise HTTPException(400, "Автопродление недоступно для этого тарифа")
    sub.auto_renew_enabled = body.enabled
    await session.commit()
    return {"ok": True, "enabled": sub.auto_renew_enabled}


@router.delete("/miniapp/api/devices/{device_id}")
async def delete_device(
    device_id: Annotated[str, ApiPath(min_length=1, max_length=256)],
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    sub = await _require_subscription(session, user)
    await _upstream(
        SubscriptionService(
            session, request.app.state.adaptgroup_client
        ).delete_device(sub, device_id)
    )
    return {"ok": True}


@router.get("/miniapp/api/connections")
async def connection_history(
    request: Request,
    page: int = Query(default=1, ge=1, le=1000),
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    sub = await _require_subscription(session, user)
    per_page = 30
    payload = await _upstream(
        request.app.state.adaptgroup_client.get_requests(
            sub.subscription_uuid, page=page, per_page=per_page
        )
    )
    await session.commit()
    items = _first(payload, "requests", "items", "data", default=[])
    if isinstance(items, dict):
        items = _first(items, "items", "requests", "data", default=[])
    if not isinstance(items, list):
        items = []
    return {
        "items": [_serialize_connection(item) for item in items if isinstance(item, dict)],
        "page": page,
        "has_more": len(items) >= per_page,
    }


@router.post("/miniapp/api/orders/purchase")
async def purchase_plan(
    body: PurchaseBody,
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    plan = await PlanRepository(session).get_by_uuid(body.plan_uuid)
    if plan is None or not plan.is_active or not plan.is_public or plan.is_trial:
        raise HTTPException(404, "Тариф недоступен")
    if plan.retail_price is None:
        raise HTTPException(400, "У этого тарифа не указана цена — обратитесь в поддержку")
    service = OrderService(
        session,
        request.app.state.adaptgroup_client,
        get_payment_provider(),
    )
    order = await service.create_new_subscription_order(user.id, plan.plan_uuid)
    return await _start_order_payment(service, order, body.payment_method)


@router.post("/miniapp/api/orders/gift")
async def purchase_gift(
    body: GiftPurchaseBody,
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    recipient_key = body.recipient.strip().lstrip("@")
    users = UserRepository(session)
    recipient = (
        await users.get_by_telegram_id(int(recipient_key))
        if recipient_key.isdigit()
        else await users.get_by_username(recipient_key)
    )
    if recipient is None:
        raise HTTPException(404, "Получатель не найден. Сначала он должен открыть бота")
    if recipient.id == user.id:
        raise HTTPException(400, "Для себя используйте обычную покупку")
    plan = await PlanRepository(session).get_by_uuid(body.plan_uuid)
    if plan is None or not plan.is_active or not plan.is_public or plan.is_trial:
        raise HTTPException(404, "Тариф недоступен")
    if plan.retail_price is None:
        raise HTTPException(400, "У тарифа не указана цена")
    service = OrderService(
        session,
        request.app.state.adaptgroup_client,
        get_payment_provider(),
    )
    order = await service.create_gift_order(user.id, recipient, plan.plan_uuid)
    return await _start_order_payment(service, order, body.payment_method)


@router.post("/miniapp/api/orders/renew")
async def renew_subscription(
    body: PaymentMethodBody,
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    sub = await _require_subscription(session, user)
    if sub.is_trial or not sub.plan_uuid:
        raise HTTPException(400, "Выберите основной тариф")
    plan = await PlanRepository(session).get_by_uuid(sub.plan_uuid)
    if plan is None or plan.retail_price is None:
        raise HTTPException(400, "Цена текущего тарифа недоступна")
    service = OrderService(
        session,
        request.app.state.adaptgroup_client,
        get_payment_provider(),
    )
    order = await service.create_action_order(
        user.id,
        OrderType.RENEW,
        sub.subscription_uuid,
        amount=Decimal(str(plan.retail_price)),
        currency=plan.currency,
        extra={"plan_uuid": plan.plan_uuid, "plan_name": plan.name},
    )
    return await _start_order_payment(service, order, body.payment_method)


@router.post("/miniapp/api/orders/renew/custom")
async def renew_subscription_custom(
    body: CustomRenewBody,
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    sub = await _require_subscription(session, user)
    if sub.is_trial or not sub.plan_uuid:
        raise HTTPException(400, "Выберите основной тариф перед продлением")
    plan = await PlanRepository(session).get_by_uuid(sub.plan_uuid)
    if plan is None or plan.retail_price is None or not plan.duration_days:
        raise HTTPException(400, "Не удалось рассчитать стоимость одного дня")
    per_day = Decimal(str(plan.retail_price)) / Decimal(plan.duration_days)
    amount = (per_day * body.days).quantize(Decimal("0.01"))
    service = OrderService(
        session,
        request.app.state.adaptgroup_client,
        get_payment_provider(),
    )
    order = await service.create_action_order(
        user.id,
        OrderType.RENEW_CUSTOM,
        sub.subscription_uuid,
        amount=amount,
        currency=plan.currency,
        extra={
            "days": body.days,
            "plan_uuid": plan.plan_uuid,
            "plan_name": plan.name,
        },
    )
    return await _start_order_payment(service, order, body.payment_method)


@router.post("/miniapp/api/orders/topup")
async def top_up_balance(
    body: TopUpBody,
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    if body.amount < settings.min_balance_topup or body.amount > settings.max_balance_topup:
        raise HTTPException(
            400,
            f"Сумма должна быть от {settings.min_balance_topup} до {settings.max_balance_topup}",
        )
    service = OrderService(
        session,
        request.app.state.adaptgroup_client,
        get_payment_provider(),
    )
    order = await service.create_balance_topup_order(user.id, body.amount)
    return await _start_order_payment(service, order, body.payment_method)


@router.post("/miniapp/api/orders/{order_uuid}/check")
async def check_order(
    order_uuid: str,
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    service = OrderService(
        session,
        request.app.state.adaptgroup_client,
        get_payment_provider(),
    )
    order = await service.orders.get_by_uuid(order_uuid)
    if order is None or order.user_id != user.id:
        raise HTTPException(404, "Заказ не найден")
    paid = await service.check_and_mark_paid(order)
    if not paid:
        return {"ok": False, "status": str(order.status), "message": "Оплата ещё не подтверждена"}
    outcome = await service.provision(order)
    return {
        "ok": bool(outcome.provisioned or outcome.already_done),
        "status": str(order.status),
        "message": outcome.error or "Готово",
    }


@router.get("/miniapp/api/orders/{order_uuid}")
async def user_order_details(
    order_uuid: str,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    order = await OrderRepository(session).get_by_uuid(order_uuid)
    if order is None or order.user_id != user.id:
        raise HTTPException(404, "Заказ не найден")
    return _serialize_order_details(order)


@router.post("/miniapp/api/promo")
async def redeem_promo(
    body: PromoBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    repo = PromoRepository(session)
    promo = await repo.get_by_code(body.code.strip())
    if promo is None:
        raise HTTPException(404, "Промокод не найден")
    ok, error = await repo.redeem(promo, user)
    if not ok:
        raise HTTPException(400, error)
    await session.commit()
    return {"ok": True, "balance": float(user.balance or 0)}


@router.get("/miniapp/api/referral")
async def referral_summary(
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    invited = await UserRepository(session).count_referrals(user.id)
    bot_username = settings.bot_username.strip().lstrip("@") or "misterfvpn_bot"
    return {
        "link": f"https://t.me/{bot_username}?start=ref_{user.id}",
        "invited": invited,
        "earned": float(user.referral_earned or 0),
        "bonus": float(settings.referral_bonus),
        "currency": settings.currency,
    }


@router.get("/miniapp/api/notifications")
async def user_notifications(
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    items = await _list_user_notifications(session, user.id, limit=50)
    return {
        "items": [_serialize_notification(item) for item in items],
        "unread": sum(1 for item in items if item.read_at is None),
    }


@router.post("/miniapp/api/notifications/{notification_id}/read")
async def read_notification(
    notification_id: int,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    notification = await session.get(UserNotification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise HTTPException(404, "Уведомление не найдено")
    notification.read_at = datetime.now(timezone.utc)
    await session.commit()
    return {"ok": True}


@router.get("/miniapp/api/support/tickets")
async def support_tickets(
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    result = await session.execute(
        select(SupportTicket)
        .where(SupportTicket.user_id == user.id)
        .order_by(SupportTicket.created_at.desc())
        .limit(20)
    )
    return {"items": [_serialize_ticket(item) for item in result.scalars().all()]}


@router.post("/miniapp/api/support/tickets")
async def create_support_ticket(
    body: SupportTicketBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    ticket = SupportTicket(
        ticket_uuid=new_uuid(),
        user_id=user.id,
        category=body.category,
        message=body.message.strip(),
    )
    session.add(ticket)
    await session.commit()
    await session.refresh(ticket)
    return _serialize_ticket(ticket)


@router.post("/miniapp/api/preferences/payment")
async def save_payment_preference(
    body: PreferredPaymentBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    user.preferred_payment_method = body.payment_method
    await session.commit()
    return {"ok": True, "payment_method": body.payment_method}


@router.get("/miniapp/api/service/latency")
async def service_latency(
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await _current_user(session, identity)
    started = perf_counter()
    online = True
    message = "AdaptGroup отвечает"
    try:
        await _upstream(request.app.state.adaptgroup_client.list_plans())
    except Exception as exc:  # noqa: BLE001
        online = False
        message = _safe_error(exc)
    return {
        "online": online,
        "latency_ms": round((perf_counter() - started) * 1000),
        "mode": "automatic",
        "selection_supported": False,
        "message": message,
    }


# ── Admin API ────────────────────────────────────────────────────────────────


@router.get("/miniapp/api/admin/overview")
async def admin_overview(
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    user = await _current_user(session, identity)
    _require_scope(identity, user, "overview")
    now = datetime.now(timezone.utc)
    users = UserRepository(session)
    subscriptions = SubscriptionRepository(session)
    orders = OrderRepository(session)
    pulse_started = perf_counter()
    pulse_online = True
    pulse_message = "AdaptGroup отвечает"
    try:
        await _upstream(request.app.state.adaptgroup_client.list_plans())
    except Exception as exc:  # noqa: BLE001
        pulse_online = False
        pulse_message = _safe_error(exc)
    pulse_ms = round((perf_counter() - pulse_started) * 1000)
    revenue_30d = await orders.revenue_since(now - timedelta(days=30))
    paid_30d = await _count_paid_orders_since(session, now - timedelta(days=30))
    attention_orders = await orders.list_filtered(status=OrderStatus.FAILED, limit=6)
    attention_owners = await _users_by_id(
        session, [order.user_id for order in attention_orders]
    )
    expiring_users = await users.list_admin(segment="expiring", limit=6)
    expiring_subscriptions = await _latest_subscriptions_for(
        session, [item.id for item in expiring_users]
    )
    result = {
        "admin": {
            "role": str(UserRole.OWNER) if identity.is_admin else str(user.role),
        },
        "queue": await _admin_queue(session),
        "pulse": {
            "online": pulse_online,
            "latency_ms": pulse_ms,
            "message": pulse_message,
        },
        "metrics": {
            "users": await users.count(),
            "new_users_24h": await users.count_created_since(now - timedelta(days=1)),
            "active_subscriptions": await subscriptions.count_active(),
            "expiring_7d": await subscriptions.count_expiring_within(7),
            "orders": await orders.count(),
            "pending_orders": await orders.count_by_status(OrderStatus.PENDING),
            "manual_review": await orders.count_manual_review(),
            "revenue_24h": await orders.revenue_since(now - timedelta(days=1)),
            "revenue_30d": revenue_30d,
            "paid_orders_30d": paid_30d,
            "average_check": round(revenue_30d / paid_30d, 2) if paid_30d else 0.0,
            "blocked_users": await _count_blocked_users(session),
            "frozen_subscriptions": await _count_frozen_subscriptions(session),
            "active_promos": await PromoRepository(session).count_active(),
        },
        "series": await _admin_series(session, days=14),
        "top_plans": await _admin_top_plans(session, since=now - timedelta(days=30)),
        "recent_orders": [
            _serialize_order(order) for order in await orders.list_recent(limit=8)
        ],
        "attention": {
            "failed_orders": [
                _serialize_order(order, owner=attention_owners.get(order.user_id))
                for order in attention_orders
            ],
            "expiring_users": [
                _serialize_admin_user(item, expiring_subscriptions.get(item.id))
                for item in expiring_users
            ],
        },
    }
    await session.commit()
    return result


@router.get("/miniapp/api/admin/users")
async def admin_users(
    q: str = Query(default="", max_length=128),
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    segment: Literal["all", "active", "expiring", "no_subscription", "blocked"] = "all",
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "users:read")
    users = UserRepository(session)
    found = await users.list_admin(
        segment=segment,
        query=q,
        limit=limit,
        offset=offset,
    )
    total = await users.count_admin(segment=segment, query=q)
    subs_by_user = await _latest_subscriptions_for(session, [u.id for u in found])
    items = [_serialize_admin_user(item, subs_by_user.get(item.id)) for item in found]
    await session.commit()
    return {
        "items": items,
        "segment": segment,
        "total": total,
        "offset": offset,
        "has_more": offset + len(items) < total,
    }


@router.get("/miniapp/api/admin/users/{user_id}")
async def admin_user_card(
    user_id: int,
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "users:read")
    user = await UserRepository(session).get_by_id(user_id)
    if user is None:
        raise HTTPException(404, "Пользователь не найден")
    subscriptions = await SubscriptionRepository(session).list_for_user(user.id)
    orders = await OrderRepository(session).list_for_user(user.id, limit=20)
    totals_result = await session.execute(
        select(
            func.coalesce(func.sum(Order.amount), 0),
            func.count(Order.id),
        )
        .where(Order.user_id == user.id)
        .where(Order.paid_at.is_not(None))
        .where(Order.payment_provider.notin_(["free_trial", "admin_grant"]))
    )
    spent, paid_orders = totals_result.one()
    renewals_result = await session.execute(
        select(func.count())
        .select_from(Order)
        .where(Order.user_id == user.id)
        .where(Order.order_type.in_([OrderType.RENEW, OrderType.RENEW_CUSTOM]))
        .where(Order.status == OrderStatus.COMPLETED)
    )
    devices: list[dict[str, Any]] = []
    active = next((sub for sub in subscriptions if sub.is_active and not sub.is_expired), None)
    if active is not None:
        try:
            raw_devices = await _upstream(
                SubscriptionService(session, request.app.state.adaptgroup_client).get_devices(active)
            )
            devices = [_serialize_device(item) for item in raw_devices]
        except Exception:
            devices = []
    audit_result = await session.execute(
        select(AdminAuditLog)
        .where(AdminAuditLog.target_type == "user")
        .where(AdminAuditLog.target_id == str(user.id))
        .order_by(AdminAuditLog.created_at.desc())
        .limit(20)
    )
    await session.commit()
    return {
        "user": _serialize_admin_user(user, subscriptions[0] if subscriptions else None),
        "subscriptions": [_serialize_subscription(sub, []) for sub in subscriptions],
        "orders": [_serialize_order(order) for order in orders],
        "devices": devices,
        "summary": {
            "spent": float(spent or 0),
            "paid_orders": int(paid_orders or 0),
            "renewals": int(renewals_result.scalar_one()),
            "device_count": len(devices),
        },
        "audit": [_serialize_audit(item) for item in audit_result.scalars().all()],
    }


@router.post("/miniapp/api/admin/users/{user_id}/extend")
async def admin_extend_subscription(
    user_id: int,
    body: AdminExtendBody,
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Extend an existing subscription by N days as a free audited order."""
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "users:support")
    target = await UserRepository(session).get_by_id(user_id)
    if target is None:
        raise HTTPException(404, "Пользователь не найден")
    sub = await SubscriptionRepository(session).get_active_for_user(target.id)
    if sub is None:
        raise HTTPException(404, "У пользователя нет подписки")

    service = OrderService(
        session,
        request.app.state.adaptgroup_client,
        get_payment_provider(),
    )
    order = await service.create_action_order(
        target.id,
        OrderType.RENEW_CUSTOM,
        sub.subscription_uuid,
        amount=Decimal("0"),
        currency=settings.currency,
        extra={"days": body.days, "admin_granted_by": identity.telegram_id},
    )
    order.payment_provider = "admin_grant"
    await service.orders.mark_paid(
        order, payment_id=f"admin:{identity.telegram_id}:{order.order_uuid}"
    )
    await session.commit()
    outcome = await service.provision(order)
    if not (outcome.provisioned or outcome.already_done):
        raise HTTPException(502, outcome.error or "Не удалось продлить подписку")
    await write_audit(
        session,
        admin,
        action="user.extend",
        target_type="user",
        target_id=target.id,
        summary=f"Подписка продлена на {body.days} дней",
        details={"order_uuid": order.order_uuid},
    )
    await session.commit()
    if body.notify:
        await _notify_user(
            request,
            target.telegram_id,
            f"♻️ <b>Администрация продлила вашу подписку на {body.days} дн.</b>",
        )
    return {"ok": True, "order": _serialize_order(order)}


@router.post("/miniapp/api/admin/users/{user_id}/freeze")
async def admin_freeze_subscription(
    user_id: int,
    body: EnabledBody,
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "users:support")
    target = await UserRepository(session).get_by_id(user_id)
    if target is None:
        raise HTTPException(404, "Пользователь не найден")
    sub = await SubscriptionRepository(session).get_active_for_user(target.id)
    if sub is None:
        raise HTTPException(404, "У пользователя нет подписки")
    service = SubscriptionService(session, request.app.state.adaptgroup_client)
    if body.enabled and not sub.is_frozen:
        await _upstream(service.freeze(sub))
    elif not body.enabled and sub.is_frozen:
        await _upstream(service.unfreeze(sub))
    await write_audit(
        session,
        admin,
        action="user.freeze" if body.enabled else "user.unfreeze",
        target_type="user",
        target_id=target.id,
        summary="Подписка заморожена" if body.enabled else "Подписка разморожена",
    )
    await session.commit()
    return {"ok": True, "is_frozen": sub.is_frozen}


@router.post("/miniapp/api/admin/users/{user_id}/message")
async def admin_message_user(
    user_id: int,
    body: AdminMessageBody,
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "users:support")
    target = await UserRepository(session).get_by_id(user_id)
    if target is None:
        raise HTTPException(404, "Пользователь не найден")
    sent = await _notify_user(request, target.telegram_id, _escape_html(body.text))
    if not sent:
        raise HTTPException(502, "Telegram не принял сообщение — возможно, бот заблокирован")
    await write_audit(
        session,
        admin,
        action="user.message",
        target_type="user",
        target_id=target.id,
        summary="Пользователю отправлено сообщение",
    )
    await session.commit()
    return {"ok": True}


@router.post("/miniapp/api/admin/broadcast")
async def admin_broadcast(
    body: AdminBroadcastBody,
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Count an audience, and unless dry_run, start a rate-limited send."""
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "marketing")
    _validate_button(body.button_text, body.button_url)
    recipients = await _broadcast_audience(session, body.audience)
    if body.dry_run:
        return {"ok": True, "dry_run": True, "recipients": len(recipients)}
    bot = getattr(request.app.state, "bot", None)
    if bot is None:
        raise HTTPException(503, "Бот не сконфигурирован на этом сервере")

    if body.template_name:
        existing = await session.execute(
            select(BroadcastTemplate).where(BroadcastTemplate.name == body.template_name.strip())
        )
        template = existing.scalar_one_or_none()
        if template is None:
            template = BroadcastTemplate(
                name=body.template_name.strip(),
                text=body.text,
                created_by_user_id=admin.id,
            )
            session.add(template)
        template.text = body.text
        template.image_url = body.image_url
        template.button_text = body.button_text
        template.button_url = body.button_url

    if body.test_telegram_id is not None:
        await _send_admin_message(
            bot,
            body.test_telegram_id,
            body.text,
            image_url=body.image_url,
            button_text=body.button_text,
            button_url=body.button_url,
        )
        await write_audit(
            session,
            admin,
            action="broadcast.test",
            target_type="broadcast",
            target_id=body.test_telegram_id,
            summary="Отправлено тестовое сообщение",
        )
        await session.commit()
        return {"ok": True, "test": True, "recipients": 1}

    now = datetime.now(timezone.utc)
    if body.schedule_at is not None and _aware(body.schedule_at) > now:
        campaign = AdminCampaign(
            campaign_uuid=new_uuid(),
            name=body.template_name or f"Рассылка {now:%d.%m %H:%M}",
            kind="manual",
            status="scheduled",
            audience=body.audience,
            text=body.text,
            image_url=body.image_url,
            button_text=body.button_text,
            button_url=body.button_url,
            schedule_at=body.schedule_at,
            created_by_user_id=admin.id,
        )
        session.add(campaign)
        await write_audit(
            session,
            admin,
            action="broadcast.schedule",
            target_type="campaign",
            target_id=campaign.campaign_uuid,
            summary=f"Запланирована рассылка на {_iso(body.schedule_at)}",
        )
        await session.commit()
        return {"ok": True, "scheduled": True, "campaign": _serialize_campaign(campaign)}

    if not recipients:
        raise HTTPException(400, "В этом сегменте нет получателей")

    broadcast_id = f"bc{int(datetime.now(timezone.utc).timestamp())}"
    _broadcasts[broadcast_id] = {
        "id": broadcast_id,
        "total": len(recipients),
        "sent": 0,
        "failed": 0,
        "done": False,
        "audience": body.audience,
    }
    asyncio.create_task(
        _run_broadcast(
            bot,
            broadcast_id,
            recipients,
            body.text,
            image_url=body.image_url,
            button_text=body.button_text,
            button_url=body.button_url,
        )
    )
    await write_audit(
        session,
        admin,
        action="broadcast.start",
        target_type="broadcast",
        target_id=broadcast_id,
        summary=f"Запущена рассылка на {len(recipients)} получателей",
        details={"audience": body.audience},
    )
    await session.commit()
    return {"ok": True, "broadcast_id": broadcast_id, "recipients": len(recipients)}


@router.get("/miniapp/api/admin/broadcast/{broadcast_id}")
async def admin_broadcast_status(
    broadcast_id: str,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "marketing")
    progress = _broadcasts.get(broadcast_id)
    if progress is None:
        raise HTTPException(404, "Рассылка не найдена")
    return progress


@router.get("/miniapp/api/admin/orders")
async def admin_orders(
    status: Literal[
        "all", "pending", "paid", "provisioning", "completed", "failed", "cancelled"
    ] = "all",
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "orders:read")
    repo = OrderRepository(session)
    selected_status = None if status == "all" else OrderStatus(status)
    orders = await repo.list_filtered(
        status=selected_status,
        limit=limit,
        offset=offset,
    )
    total = await repo.count_filtered(status=selected_status)
    owners = await _users_by_id(session, [order.user_id for order in orders])
    await session.commit()
    return {
        "items": [
            _serialize_order(order, owner=owners.get(order.user_id)) for order in orders
        ],
        "status": status,
        "total": total,
        "offset": offset,
        "has_more": offset + len(orders) < total,
    }


@router.get("/miniapp/api/admin/orders/{order_uuid}")
async def admin_order_card(
    order_uuid: str,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "orders:read")
    order = await OrderRepository(session).get_by_uuid(order_uuid)
    if order is None:
        raise HTTPException(404, "Заказ не найден")
    owner = await UserRepository(session).get_by_id(order.user_id)
    audit_result = await session.execute(
        select(AdminAuditLog)
        .where(AdminAuditLog.target_type == "order")
        .where(AdminAuditLog.target_id == order.order_uuid)
        .order_by(AdminAuditLog.created_at.desc())
        .limit(30)
    )
    await session.commit()
    payload = _serialize_order_details(order, owner=owner)
    payload["history"] = [_serialize_audit(item) for item in audit_result.scalars().all()]
    return payload


@router.post("/miniapp/api/admin/orders/{order_uuid}/retry")
async def admin_retry_order(
    order_uuid: str,
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Re-run provisioning for an order that failed after payment."""
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "orders:operate")
    service = OrderService(
        session,
        request.app.state.adaptgroup_client,
        get_payment_provider(),
    )
    order = await service.orders.get_by_uuid(order_uuid)
    if order is None:
        raise HTTPException(404, "Заказ не найден")
    if order.status not in (
        OrderStatus.PAID,
        OrderStatus.FAILED,
        OrderStatus.PROVISIONING,
    ):
        raise HTTPException(400, "Повторная выдача возможна только для оплаченных заказов")
    if order.status == OrderStatus.PROVISIONING:
        # Release a stuck lock so provision() can claim it again.
        order.status = OrderStatus.PAID
        await session.commit()
    outcome = await service.provision(order)
    if not (outcome.provisioned or outcome.already_done):
        raise HTTPException(502, outcome.error or "Повторная выдача не удалась")
    await write_audit(
        session,
        admin,
        action="order.retry",
        target_type="order",
        target_id=order.order_uuid,
        summary="Повторная выдача заказа выполнена",
    )
    await session.commit()
    return {"ok": True, "order": _serialize_order(order)}


@router.get("/miniapp/api/admin/promos")
async def admin_list_promos(
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "promos")
    promos = await PromoRepository(session).list_recent(limit=40)
    await session.commit()
    return {"items": [_serialize_promo(promo) for promo in promos]}


@router.post("/miniapp/api/admin/promos/{code}/toggle")
async def admin_toggle_promo(
    code: str,
    body: EnabledBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "promos")
    promo = await PromoRepository(session).get_by_code(code)
    if promo is None:
        raise HTTPException(404, "Промокод не найден")
    promo.is_active = body.enabled
    await write_audit(
        session,
        admin,
        action="promo.toggle",
        target_type="promo",
        target_id=promo.code,
        summary="Промокод включен" if body.enabled else "Промокод выключен",
    )
    await session.commit()
    return {"ok": True, "promo": _serialize_promo(promo)}


@router.post("/miniapp/api/admin/promos/{code}")
async def admin_update_promo(
    code: str,
    body: AdminPromoUpdateBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "promos")
    promo = await PromoRepository(session).get_by_code(code)
    if promo is None:
        raise HTTPException(404, "Промокод не найден")
    if body.max_uses is not None and body.max_uses < promo.used_count:
        raise HTTPException(400, "Лимит не может быть меньше числа активаций")
    promo.amount = body.amount
    promo.max_uses = body.max_uses
    promo.audience = body.audience
    promo.per_user_limit = body.per_user_limit
    promo.expires_at = (
        datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)
        if body.expires_in_days is not None
        else None
    )
    await write_audit(
        session,
        admin,
        action="promo.update",
        target_type="promo",
        target_id=promo.code,
        summary="Параметры промокода обновлены",
    )
    await session.commit()
    return {"ok": True, "promo": _serialize_promo(promo)}


@router.post("/miniapp/api/admin/users/{user_id}/balance")
async def admin_change_balance(
    user_id: int,
    body: AdminBalanceBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "users:finance")
    if not body.confirm:
        raise HTTPException(400, "Требуется подтверждение изменения баланса")
    user = await UserRepository(session).get_by_id(user_id)
    if user is None:
        raise HTTPException(404, "Пользователь не найден")
    new_balance = Decimal(str(user.balance or 0)) + body.delta
    if new_balance < 0:
        raise HTTPException(400, "Баланс не может быть отрицательным")
    user.balance = new_balance
    user.balance_currency = settings.currency
    await write_audit(
        session,
        admin,
        action="user.balance",
        target_type="user",
        target_id=user.id,
        summary=f"Баланс изменен на {body.delta}",
        details={"balance": float(new_balance)},
    )
    await session.commit()
    return {"ok": True, "balance": float(user.balance)}


@router.post("/miniapp/api/admin/users/{user_id}/block")
async def admin_toggle_user_block(
    user_id: int,
    body: AdminBlockBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "users:support")
    if not body.confirm:
        raise HTTPException(400, "Требуется подтверждение блокировки")
    user = await UserRepository(session).get_by_id(user_id)
    if user is None:
        raise HTTPException(404, "Пользователь не найден")
    if user.id == admin.id and body.enabled:
        raise HTTPException(400, "Нельзя заблокировать себя")
    user.is_blocked = body.enabled
    await write_audit(
        session,
        admin,
        action="user.block" if body.enabled else "user.unblock",
        target_type="user",
        target_id=user.id,
        summary="Пользователь заблокирован" if body.enabled else "Пользователь разблокирован",
    )
    await session.commit()
    return {"ok": True, "is_blocked": user.is_blocked}


@router.post("/miniapp/api/admin/users/{user_id}/grant")
async def admin_grant_subscription(
    user_id: int,
    body: AdminGrantBody,
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "users:support")
    if not body.confirm:
        raise HTTPException(400, "Требуется подтверждение ручной выдачи")
    target = await UserRepository(session).get_by_id(user_id)
    if target is None:
        raise HTTPException(404, "Пользователь не найден")
    plan = await PlanRepository(session).get_by_uuid(body.plan_uuid)
    if plan is None or not plan.is_active or plan.is_trial:
        raise HTTPException(404, "Тариф недоступен")
    service = OrderService(
        session,
        request.app.state.adaptgroup_client,
        get_payment_provider(),
    )
    order = await service.create_new_subscription_order(target.id, plan.plan_uuid)
    order.payment_provider = "admin_grant"
    snapshot = dict(order.snapshot or {})
    snapshot["admin_granted_by"] = identity.telegram_id
    order.snapshot = snapshot
    await service.orders.mark_paid(order, payment_id=f"admin:{identity.telegram_id}:{order.order_uuid}")
    await session.commit()
    outcome = await service.provision(order)
    if not (outcome.provisioned or outcome.already_done):
        raise HTTPException(502, outcome.error or "Не удалось выдать VPN")
    await write_audit(
        session,
        admin,
        action="user.grant",
        target_type="user",
        target_id=target.id,
        summary=f"VPN выдан вручную: {plan.name}",
        details={"order_uuid": order.order_uuid},
    )
    await session.commit()
    return {"ok": True, "order": _serialize_order(order)}


@router.get("/miniapp/api/admin/plans")
async def admin_plans(
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "orders:finance")
    return {
        "items": [_serialize_plan(plan, admin=True) for plan in await PlanRepository(session).list_all()]
    }


@router.post("/miniapp/api/admin/plans/{plan_uuid}/visibility")
async def admin_plan_visibility(
    plan_uuid: str,
    body: EnabledBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "orders:finance")
    plan = await PlanRepository(session).get_by_uuid(plan_uuid)
    if plan is None:
        raise HTTPException(404, "Тариф не найден")
    plan.is_public = body.enabled
    await write_audit(
        session, admin, action="plan.visibility", target_type="plan",
        target_id=plan.plan_uuid, summary=f"Видимость тарифа: {body.enabled}",
    )
    await session.commit()
    return {"ok": True, "is_public": plan.is_public}


class AdminPlanEditBody(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    retail_price: Decimal | None = Field(default=None, ge=0)
    is_public: bool | None = None
    is_active: bool | None = None
    button_style: str | None = None


@router.post("/miniapp/api/admin/plans/{plan_uuid}/edit")
async def admin_plan_edit(
    plan_uuid: str,
    body: AdminPlanEditBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "orders:finance")
    plan = await PlanRepository(session).get_by_uuid(plan_uuid)
    if plan is None:
        raise HTTPException(404, "Тариф не найден")
    if body.name is not None:
        plan.name = body.name.strip()
        plan.manual_name = True
    if body.retail_price is not None:
        plan.retail_price = body.retail_price
        plan.manual_price = True
    if body.is_public is not None:
        plan.is_public = body.is_public
    if body.is_active is not None:
        plan.is_active = body.is_active
    if body.button_style is not None:
        plan.button_style = body.button_style
    await session.commit()
    return {"ok": True, "plan": _serialize_plan(plan, admin=True)}


@router.post("/miniapp/api/admin/plans/{plan_uuid}/price")
async def admin_plan_price(
    plan_uuid: str,
    body: AdminPlanPriceBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Set a manual retail price, or clear it to follow AdaptGroup again."""
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "orders:finance")
    plan = await PlanRepository(session).get_by_uuid(plan_uuid)
    if plan is None:
        raise HTTPException(404, "Тариф не найден")
    if body.price is None:
        plan.manual_price = False
    else:
        plan.retail_price = body.price
        plan.manual_price = True
    await write_audit(
        session, admin, action="plan.price", target_type="plan",
        target_id=plan.plan_uuid, summary="Цена тарифа обновлена",
        details={"price": None if body.price is None else float(body.price)},
    )
    await session.commit()
    return {"ok": True, "plan": _serialize_plan(plan, admin=True)}


@router.post("/miniapp/api/admin/plans/sync")
async def admin_sync_plans(
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "orders:finance")
    plans = await PlanService(session, request.app.state.adaptgroup_client).sync_plans()
    await write_audit(
        session, admin, action="plan.sync", target_type="plan",
        target_id="all", summary=f"Синхронизировано тарифов: {len(plans)}",
    )
    await session.commit()
    return {"ok": True, "count": len(plans)}


@router.post("/miniapp/api/admin/promos")
async def admin_create_promo(
    body: AdminPromoBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "promos")
    expires_days = body.expires_in_days if body.expires_in_days is not None else body.expires_days
    expires_at = (
        datetime.now(timezone.utc) + timedelta(days=expires_days)
        if expires_days
        else None
    )
    amount = body.amount if body.amount is not None else body.discount_value or Decimal("100")
    max_uses = body.max_uses if body.max_uses is not None else body.max_usages
    try:
        promo = await PromoRepository(session).create(
            code=body.code.strip().upper(),
            amount=amount,
            max_uses=max_uses,
            expires_at=expires_at,
            created_by_user_id=admin.id,
            audience=body.audience,
            per_user_limit=body.per_user_limit,
        )
        await write_audit(
            session, admin, action="promo.create", target_type="promo",
            target_id=promo.code, summary="Промокод создан",
        )
        await session.commit()
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        raise HTTPException(400, "Такой промокод уже существует") from exc
    return {
        "ok": True,
        "promo": {
            "code": promo.code,
            "amount": float(promo.amount),
            "max_uses": promo.max_uses,
        },
    }


# ── Helpers ──────────────────────────────────────────────────────────────────


@router.get("/miniapp/api/admin/search")
async def admin_global_search(
    q: str = Query(min_length=2, max_length=128),
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "users:read")
    clean = q.strip().lstrip("@")
    like = f"%{clean}%"
    users_result = await session.execute(
        select(User).where(or_(
            User.username.ilike(like), User.first_name.ilike(like),
            cast(User.telegram_id, String).like(like),
        )).order_by(User.last_activity_at.desc()).limit(10)
    )
    orders_result = await session.execute(
        select(Order).where(or_(
            Order.order_uuid.ilike(like), Order.payment_id.ilike(like),
            Order.subscription_uuid.ilike(like),
        )).order_by(Order.created_at.desc()).limit(10)
    )
    subscriptions_result = await session.execute(
        select(VPNSubscription).where(or_(
            VPNSubscription.subscription_uuid.ilike(like),
            VPNSubscription.plan_uuid.ilike(like), VPNSubscription.plan_name.ilike(like),
        )).order_by(VPNSubscription.created_at.desc()).limit(10)
    )
    users = list(users_result.scalars().all())
    orders = list(orders_result.scalars().all())
    subscriptions = list(subscriptions_result.scalars().all())
    owners = await _users_by_id(
        session, [item.user_id for item in orders] + [item.user_id for item in subscriptions]
    )
    return {
        "users": [_serialize_admin_user(item, None) for item in users],
        "orders": [_serialize_order(item, owner=owners.get(item.user_id)) for item in orders],
        "subscriptions": [{
            **_serialize_subscription(item, []),
            "owner": _serialize_admin_user(owners[item.user_id], item) if item.user_id in owners else None,
        } for item in subscriptions],
    }


@router.get("/miniapp/api/admin/health")
async def admin_health(
    request: Request,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "overview")
    db_started = perf_counter()
    await session.execute(select(1))
    database_ms = round((perf_counter() - db_started) * 1000)
    upstream_started = perf_counter()
    upstream_online = True
    upstream_error = None
    try:
        await _upstream(request.app.state.adaptgroup_client.list_plans())
    except Exception as exc:  # noqa: BLE001
        upstream_online = False
        upstream_error = _safe_error(exc)
    open_tasks = await session.execute(
        select(func.count()).select_from(AdminTask).where(AdminTask.status == "open")
    )
    return {
        "database": {"online": True, "latency_ms": database_ms},
        "telegram": {"online": getattr(request.app.state, "bot", None) is not None},
        "adaptgroup": {
            "online": upstream_online,
            "latency_ms": round((perf_counter() - upstream_started) * 1000),
            "error": upstream_error,
        },
        "workers": {"campaigns": True, "open_tasks": int(open_tasks.scalar_one())},
        "checked_at": _iso(datetime.now(timezone.utc)),
    }


@router.post("/miniapp/api/admin/users/{user_id}/profile")
async def admin_update_user_profile(
    user_id: int,
    body: AdminUserUpdateBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "users:support")
    target = await UserRepository(session).get_by_id(user_id)
    if target is None:
        raise HTTPException(404, "Пользователь не найден")
    target.admin_note = body.note.strip() if body.note else None
    target.admin_tags = sorted({tag.strip().lower()[:32] for tag in body.tags if tag.strip()})[:30]
    await write_audit(
        session, admin, action="user.profile.update", target_type="user", target_id=target.id,
        summary="Обновлены заметка и теги пользователя", details={"tags": target.admin_tags},
    )
    await session.commit()
    return {"ok": True, "user": _serialize_admin_user(target, None)}


@router.post("/miniapp/api/admin/users/{user_id}/role")
async def admin_update_user_role(
    user_id: int,
    body: AdminRoleBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "roles")
    target = await UserRepository(session).get_by_id(user_id)
    if target is None:
        raise HTTPException(404, "Пользователь не найден")
    if target.id == admin.id and body.role == "user":
        raise HTTPException(400, "Нельзя снять собственные права")
    previous = str(target.role)
    target.role = UserRole(body.role)
    await write_audit(
        session, admin, action="user.role.update", target_type="user", target_id=target.id,
        summary=f"Роль изменена: {previous} -> {body.role}",
        details={"previous": previous, "role": body.role},
    )
    await session.commit()
    return {"ok": True, "role": str(target.role)}


@router.get("/miniapp/api/admin/audit")
async def admin_audit(
    limit: int = Query(default=50, ge=1, le=200),
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "overview")
    result = await session.execute(
        select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(limit)
    )
    return {"items": [_serialize_audit(item) for item in result.scalars().all()]}


@router.get("/miniapp/api/admin/tasks")
async def admin_tasks(
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "overview")
    result = await session.execute(
        select(AdminTask).where(AdminTask.status == "open")
        .order_by(AdminTask.created_at.desc()).limit(100)
    )
    return {"items": [_serialize_task(item) for item in result.scalars().all()]}


@router.post("/miniapp/api/admin/tasks/{task_uuid}/resolve")
async def admin_resolve_task(
    task_uuid: str,
    body: AdminTaskResolveBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "orders:operate")
    if not body.confirm:
        raise HTTPException(400, "Требуется подтверждение")
    result = await session.execute(select(AdminTask).where(AdminTask.task_uuid == task_uuid))
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(404, "Задача не найдена")
    task.status = "resolved"
    task.resolved_by_user_id = admin.id
    task.resolved_at = datetime.now(timezone.utc)
    details = dict(task.details or {})
    if body.resolution:
        details["resolution"] = body.resolution
    task.details = details
    await write_audit(
        session, admin, action="task.resolve", target_type="task",
        target_id=task.task_uuid, summary=task.title,
    )
    await session.commit()
    return {"ok": True}


@router.post("/miniapp/api/admin/orders/{order_uuid}/cancel")
async def admin_cancel_order(
    order_uuid: str,
    body: AdminConfirmBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "orders:finance")
    if not body.confirm:
        raise HTTPException(400, "Требуется подтверждение отмены")
    order = await OrderRepository(session).get_by_uuid(order_uuid)
    if order is None:
        raise HTTPException(404, "Заказ не найден")
    if order.status != OrderStatus.PENDING:
        raise HTTPException(400, "Отменить можно только неоплаченный заказ")
    order.status = OrderStatus.CANCELLED
    await write_audit(
        session, admin, action="order.cancel", target_type="order",
        target_id=order.order_uuid, summary="Неоплаченный заказ отменен",
    )
    await session.commit()
    return {"ok": True, "order": _serialize_order(order)}


@router.post("/miniapp/api/admin/orders/{order_uuid}/manual-complete")
async def admin_manual_complete_order(
    order_uuid: str,
    body: AdminManualCompleteBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "orders:operate")
    if not body.confirm:
        raise HTTPException(400, "Требуется подтверждение ручной выдачи")
    order = await OrderRepository(session).get_by_uuid(order_uuid)
    if order is None:
        raise HTTPException(404, "Заказ не найден")
    if order.status not in {OrderStatus.PAID, OrderStatus.FAILED, OrderStatus.PROVISIONING}:
        raise HTTPException(400, "Ручная выдача доступна только для оплаченного проблемного заказа")
    await OrderRepository(session).mark_completed(order, body.subscription_uuid)
    await write_audit(
        session, admin, action="order.manual_complete", target_type="order",
        target_id=order.order_uuid, summary="Заказ отмечен выданным вручную",
        details={"subscription_uuid": body.subscription_uuid},
    )
    await session.commit()
    return {"ok": True, "order": _serialize_order(order)}


@router.post("/miniapp/api/admin/orders/{order_uuid}/refund-request")
async def admin_refund_request(
    order_uuid: str,
    body: AdminConfirmBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "orders:finance")
    if not body.confirm:
        raise HTTPException(400, "Требуется подтверждение")
    order = await OrderRepository(session).get_by_uuid(order_uuid)
    if order is None:
        raise HTTPException(404, "Заказ не найден")
    task = AdminTask(
        task_uuid=new_uuid(), task_type="refund", priority="high",
        title=f"Проверить возврат по заказу {order.order_uuid[:8]}",
        target_type="order", target_id=order.order_uuid,
        details={
            "payment_provider": order.payment_provider,
            "payment_id": order.payment_id,
            "amount": float(order.amount),
        },
        created_by_user_id=admin.id,
    )
    session.add(task)
    await write_audit(
        session, admin, action="order.refund_request", target_type="order",
        target_id=order.order_uuid, summary="Создана ручная задача на возврат",
    )
    await session.commit()
    return {"ok": True, "task": _serialize_task(task), "provider_refund_supported": False}


@router.get("/miniapp/api/admin/campaigns")
async def admin_list_campaigns(
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "campaigns")
    result = await session.execute(
        select(AdminCampaign).order_by(AdminCampaign.created_at.desc()).limit(100)
    )
    return {"items": [_serialize_campaign(item) for item in result.scalars().all()]}


@router.post("/miniapp/api/admin/campaigns")
async def admin_create_campaign(
    body: AdminCampaignBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "campaigns")
    _validate_button(body.button_text, body.button_url)
    campaign = AdminCampaign(
        campaign_uuid=new_uuid(), name=body.name.strip(), kind=body.kind,
        status="active" if body.kind == "automatic" else "scheduled",
        audience=body.audience,
        trigger_type=body.trigger_type or (body.audience if body.kind == "automatic" else None),
        text=body.text, image_url=body.image_url, button_text=body.button_text,
        button_url=body.button_url,
        schedule_at=body.schedule_at or datetime.now(timezone.utc),
        created_by_user_id=admin.id,
    )
    session.add(campaign)
    await write_audit(
        session, admin, action="campaign.create", target_type="campaign",
        target_id=campaign.campaign_uuid, summary=f"Создана кампания {campaign.name}",
    )
    await session.commit()
    return {"ok": True, "campaign": _serialize_campaign(campaign)}


@router.post("/miniapp/api/admin/campaigns/{campaign_uuid}/toggle")
async def admin_toggle_campaign(
    campaign_uuid: str,
    body: EnabledBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "campaigns")
    result = await session.execute(
        select(AdminCampaign).where(AdminCampaign.campaign_uuid == campaign_uuid)
    )
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(404, "Кампания не найдена")
    campaign.status = "active" if body.enabled else "paused"
    await write_audit(
        session, admin, action="campaign.toggle", target_type="campaign",
        target_id=campaign.campaign_uuid, summary=f"Кампания: {campaign.status}",
    )
    await session.commit()
    return {"ok": True, "campaign": _serialize_campaign(campaign)}


@router.get("/miniapp/api/admin/templates")
async def admin_list_templates(
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "marketing")
    result = await session.execute(select(BroadcastTemplate).order_by(BroadcastTemplate.name))
    return {"items": [_serialize_template(item) for item in result.scalars().all()]}


@router.post("/miniapp/api/admin/templates")
async def admin_create_template(
    body: AdminTemplateBody,
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "marketing")
    _validate_button(body.button_text, body.button_url)
    existing = await session.execute(
        select(BroadcastTemplate).where(BroadcastTemplate.name == body.name.strip())
    )
    template = existing.scalar_one_or_none()
    if template is None:
        template = BroadcastTemplate(
            name=body.name.strip(), text=body.text, created_by_user_id=admin.id
        )
        session.add(template)
    template.text = body.text
    template.image_url = body.image_url
    template.button_text = body.button_text
    template.button_url = body.button_url
    await write_audit(
        session, admin, action="template.save", target_type="template",
        target_id=body.name.strip(), summary="Шаблон рассылки сохранен",
    )
    await session.commit()
    return {"ok": True, "template": _serialize_template(template)}


@router.get("/miniapp/api/admin/export/{entity}")
async def admin_export_csv(
    entity: Literal["users", "orders", "promos"],
    identity: MiniAppIdentity = Depends(get_miniapp_identity),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    admin = await _current_user(session, identity)
    _require_scope(identity, admin, "exports")
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    if entity == "users":
        writer.writerow(["id", "telegram_id", "username", "first_name", "role", "balance", "blocked", "created_at", "last_activity_at", "tags"])
        result = await session.execute(select(User).order_by(User.id))
        for item in result.scalars().all():
            writer.writerow([_csv_safe(value) for value in (
                item.id, item.telegram_id, item.username, item.first_name, str(item.role),
                item.balance, item.is_blocked, _iso(item.created_at),
                _iso(item.last_activity_at), ",".join(item.admin_tags or []),
            )])
    elif entity == "orders":
        writer.writerow(["uuid", "user_id", "type", "status", "amount", "currency", "provider", "payment_id", "subscription_uuid", "created_at", "paid_at", "error"])
        result = await session.execute(select(Order).order_by(Order.created_at.desc()))
        for item in result.scalars().all():
            writer.writerow([_csv_safe(value) for value in (
                item.order_uuid, item.user_id, str(item.order_type), str(item.status),
                item.amount, item.currency, item.payment_provider, item.payment_id,
                item.subscription_uuid, _iso(item.created_at), _iso(item.paid_at), item.error_text,
            )])
    else:
        writer.writerow(["code", "amount", "currency", "audience", "per_user_limit", "used_count", "max_uses", "active", "expires_at"])
        result = await session.execute(select(PromoCode).order_by(PromoCode.created_at.desc()))
        for item in result.scalars().all():
            writer.writerow([_csv_safe(value) for value in (
                item.code, item.amount, item.currency, item.audience, item.per_user_limit,
                item.used_count, item.max_uses, item.is_active, _iso(item.expires_at),
            )])
    await write_audit(
        session, admin, action="export.csv", target_type="export",
        target_id=entity, summary=f"Экспорт CSV: {entity}",
    )
    await session.commit()
    filename = f"mister-vpn-{entity}-{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([output.getvalue().encode("utf-8-sig")]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _upstream(awaitable: Awaitable[_T]) -> _T:
    """Await an AdaptGroup call under a deadline.

    Without this a slow upstream turns into a spinner that never resolves;
    the timeout is surfaced as a normal error message instead.
    """
    try:
        return await asyncio.wait_for(awaitable, timeout=_UPSTREAM_TIMEOUT)
    except (TimeoutError, asyncio.TimeoutError) as exc:
        raise HTTPException(504, "Сервис VPN отвечает слишком долго") from exc


def _escape_html(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


async def _notify_user(request: Request, telegram_id: int, html_text: str) -> bool:
    bot = getattr(request.app.state, "bot", None)
    if bot is None:
        return False
    try:
        await bot.send_message(telegram_id, html_text)
        return True
    except Exception as exc:  # noqa: BLE001 — a blocked bot must not fail the action
        logger.info("Mini App notification to %s failed: %s", telegram_id, exc)
        return False


async def _run_broadcast(
    bot: Any,
    broadcast_id: str,
    recipients: list[int],
    html_text: str,
    *,
    image_url: str | None = None,
    button_text: str | None = None,
    button_url: str | None = None,
) -> None:
    """Send to every recipient at ~20 msg/s, well under Telegram's limit."""
    progress = _broadcasts[broadcast_id]
    try:
        for telegram_id in recipients:
            try:
                await _send_admin_message(
                    bot,
                    telegram_id,
                    html_text,
                    image_url=image_url,
                    button_text=button_text,
                    button_url=button_url,
                )
                progress["sent"] += 1
            except Exception:  # noqa: BLE001 — blocked users are expected
                progress["failed"] += 1
            await asyncio.sleep(0.05)
    finally:
        progress["done"] = True


async def _send_admin_message(
    bot: Any,
    telegram_id: int,
    html_text: str,
    *,
    image_url: str | None = None,
    button_text: str | None = None,
    button_url: str | None = None,
) -> None:
    markup = None
    if button_text and button_url:
        markup = InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text=button_text, url=button_url)]]
        )
    if image_url:
        await bot.send_photo(
            telegram_id,
            photo=image_url,
            caption=html_text,
            reply_markup=markup,
        )
        return
    await bot.send_message(telegram_id, html_text, reply_markup=markup)


async def _broadcast_audience(session: AsyncSession, audience: str) -> list[int]:
    now = datetime.now(timezone.utc)
    stmt = select(User.telegram_id).where(User.is_blocked.is_(False))
    if audience == "active":
        stmt = stmt.where(
            User.id.in_(
                select(VPNSubscription.user_id)
                .where(VPNSubscription.is_active.is_(True))
                .where(VPNSubscription.is_frozen.is_(False))
                .where(
                    or_(
                        VPNSubscription.expires_at.is_(None),
                        VPNSubscription.expires_at > now,
                    )
                )
            )
        )
    elif audience == "expiring":
        stmt = stmt.where(
            User.id.in_(
                select(VPNSubscription.user_id)
                .where(VPNSubscription.is_active.is_(True))
                .where(VPNSubscription.expires_at > now)
                .where(VPNSubscription.expires_at <= now + timedelta(days=7))
            )
        )
    elif audience == "no_subscription":
        stmt = stmt.where(User.id.notin_(select(VPNSubscription.user_id)))
    result = await session.execute(stmt)
    return [int(value) for value in result.scalars().all()]


async def _latest_subscriptions_for(
    session: AsyncSession,
    user_ids: list[int],
) -> dict[int, VPNSubscription]:
    """Newest subscription per user, in one query instead of N."""
    if not user_ids:
        return {}
    result = await session.execute(
        select(VPNSubscription)
        .where(VPNSubscription.user_id.in_(user_ids))
        .order_by(VPNSubscription.user_id, VPNSubscription.created_at.desc())
    )
    latest: dict[int, VPNSubscription] = {}
    for sub in result.scalars().all():
        latest.setdefault(sub.user_id, sub)
    return latest


async def _users_by_id(session: AsyncSession, user_ids: list[int]) -> dict[int, User]:
    unique = [uid for uid in dict.fromkeys(user_ids) if uid]
    if not unique:
        return {}
    result = await session.execute(select(User).where(User.id.in_(unique)))
    return {user.id: user for user in result.scalars().all()}


async def _admin_queue(session: AsyncSession) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    tasks_result = await session.execute(
        select(AdminTask).where(AdminTask.status == "open")
        .order_by(AdminTask.created_at.desc()).limit(10)
    )
    items.extend(_serialize_task(item) for item in tasks_result.scalars().all())
    failed_result = await session.execute(
        select(Order).where(or_(
            Order.needs_manual_review.is_(True), Order.status == OrderStatus.FAILED,
        )).order_by(Order.created_at.desc()).limit(8)
    )
    for order in failed_result.scalars().all():
        items.append({
            "uuid": f"order:{order.order_uuid}", "type": "order",
            "status": "open", "priority": "high",
            "title": f"Проблемный заказ {order.order_uuid[:8]}",
            "target_type": "order", "target_id": order.order_uuid,
            "details": {"error": order.error_text}, "created_at": _iso(order.created_at),
        })
    tickets_result = await session.execute(
        select(SupportTicket).where(SupportTicket.status == "open")
        .order_by(SupportTicket.created_at).limit(8)
    )
    for ticket in tickets_result.scalars().all():
        items.append({
            "uuid": f"ticket:{ticket.ticket_uuid}", "type": "ticket",
            "status": "open", "priority": "normal", "title": ticket.message[:100],
            "target_type": "ticket", "target_id": ticket.ticket_uuid,
            "details": {"category": ticket.category, "user_id": ticket.user_id},
            "created_at": _iso(ticket.created_at),
        })
    return sorted(items, key=lambda item: item.get("created_at") or "", reverse=True)[:24]


async def _count_paid_orders_since(session: AsyncSession, since: datetime) -> int:
    result = await session.execute(
        select(func.count())
        .select_from(Order)
        .where(Order.paid_at >= since)
        .where(Order.payment_provider.notin_(["balance", "free_trial", "admin_grant"]))
        .where(
            Order.status.in_(
                [OrderStatus.PAID, OrderStatus.PROVISIONING, OrderStatus.COMPLETED]
            )
        )
    )
    return int(result.scalar_one())


async def _count_blocked_users(session: AsyncSession) -> int:
    result = await session.execute(
        select(func.count()).select_from(User).where(User.is_blocked.is_(True))
    )
    return int(result.scalar_one())


async def _count_frozen_subscriptions(session: AsyncSession) -> int:
    result = await session.execute(
        select(func.count())
        .select_from(VPNSubscription)
        .where(VPNSubscription.is_frozen.is_(True))
    )
    return int(result.scalar_one())


async def _admin_series(session: AsyncSession, *, days: int) -> dict[str, Any]:
    """Daily signups and revenue for the sparkline charts."""
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=days - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    signups_raw = await session.execute(
        select(func.date(User.created_at), func.count())
        .where(User.created_at >= start)
        .group_by(func.date(User.created_at))
    )
    revenue_raw = await session.execute(
        select(func.date(Order.paid_at), func.coalesce(func.sum(Order.amount), 0))
        .where(Order.paid_at >= start)
        .where(Order.payment_provider.notin_(["balance", "free_trial", "admin_grant"]))
        .where(
            Order.status.in_(
                [OrderStatus.PAID, OrderStatus.PROVISIONING, OrderStatus.COMPLETED]
            )
        )
        .group_by(func.date(Order.paid_at))
    )
    signups = {_as_date_key(key): int(value) for key, value in signups_raw.all()}
    revenue = {_as_date_key(key): float(value) for key, value in revenue_raw.all()}
    labels: list[str] = []
    signup_points: list[int] = []
    revenue_points: list[float] = []
    for offset in range(days):
        day = (start + timedelta(days=offset)).date()
        key = day.isoformat()
        labels.append(key)
        signup_points.append(signups.get(key, 0))
        revenue_points.append(round(revenue.get(key, 0.0), 2))
    return {"labels": labels, "signups": signup_points, "revenue": revenue_points}


async def _admin_top_plans(
    session: AsyncSession,
    *,
    since: datetime,
    limit: int = 5,
) -> list[dict[str, Any]]:
    result = await session.execute(
        select(
            VPNSubscription.plan_name,
            func.count().label("total"),
        )
        .where(VPNSubscription.created_at >= since)
        .where(VPNSubscription.plan_name.is_not(None))
        .group_by(VPNSubscription.plan_name)
        .order_by(func.count().desc())
        .limit(limit)
    )
    return [{"name": name, "count": int(total)} for name, total in result.all()]


def _as_date_key(value: Any) -> str:
    """SQLite returns text from date(), other drivers return date objects."""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)[:10]


async def _find_trial_plan(session: AsyncSession) -> VPNPlanSnapshot | None:
    """Same lookup the bot uses: configured UUID first, then a 7-day plan."""
    repo = PlanRepository(session)
    if settings.free_trial_plan_uuid:
        plan = await repo.get_by_uuid(settings.free_trial_plan_uuid)
        if plan and plan.is_active:
            return plan
    plans = await repo.list_active(include_trial=True, public_only=False)
    for plan in plans:
        name = plan.name.lower()
        if plan.duration_days == 7 and ("тест" in name or "test" in name or plan.is_trial):
            return plan
    for plan in plans:
        if plan.duration_days == 7:
            return plan
    return None


def _days_left(sub: VPNSubscription | None) -> int | None:
    if sub is None:
        return None
    expires = _aware(sub.expires_at)
    if expires is None:
        return None
    now = datetime.now(timezone.utc)
    return max(math.ceil((expires - now).total_seconds() / 86400), 0)


def _miniapp_static_response(filename: str, media_type: str) -> Response:
    return Response(
        content=(_STATIC_ROOT / filename).read_text(encoding="utf-8"),
        media_type=media_type,
        headers=_NO_CACHE_HEADERS,
    )


async def _current_user(session: AsyncSession, identity: MiniAppIdentity) -> User:
    repo = UserRepository(session)
    user = await repo.get_or_create(
        identity.telegram_id,
        username=identity.username,
        first_name=identity.first_name,
        language=identity.language_code,
    )
    if identity.is_admin and str(user.role) not in {str(UserRole.ADMIN), str(UserRole.OWNER)}:
        user.role = UserRole.OWNER
    if user.is_blocked:
        raise HTTPException(403, "Аккаунт заблокирован. Обратитесь в поддержку")
    return user


async def _require_subscription(session: AsyncSession, user: User) -> VPNSubscription:
    sub = await SubscriptionRepository(session).get_active_for_user(user.id)
    if sub is None:
        raise HTTPException(404, "Активная подписка не найдена")
    return sub


def _require_admin(identity: MiniAppIdentity, user: User) -> None:
    if not identity.is_admin and not is_admin_role(user):
        raise HTTPException(403, "Требуются права администратора")


def _require_scope(identity: MiniAppIdentity, user: User, scope: str) -> None:
    _require_admin(identity, user)
    if identity.is_admin or has_scope(user, scope):
        return
    raise HTTPException(403, "Недостаточно прав для этого действия")


async def _start_order_payment(
    service: OrderService,
    order: Order,
    payment_method: str,
) -> dict[str, Any]:
    if payment_method == "balance":
        if not await service.pay_from_balance(order):
            return {
                "ok": False,
                "needs_topup": True,
                "order_uuid": order.order_uuid,
                "amount": float(order.amount),
                "message": "Недостаточно средств на балансе",
            }
        outcome = await service.provision(order)
        if not (outcome.provisioned or outcome.already_done):
            raise HTTPException(502, outcome.error or "Не удалось выдать VPN")
        return {"ok": True, "completed": True, "order_uuid": order.order_uuid}

    provider_name, provider_method, label = _payment_config(payment_method)
    provider = get_payment_provider(provider_name)
    service.payments = provider
    order.payment_provider = provider.name
    snapshot = dict(order.snapshot or {})
    snapshot["payment_method"] = label
    order.snapshot = snapshot
    try:
        confirmation_url = await service.start_payment(order, payment_method=provider_method)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, _safe_error(exc)) from exc
    return {
        "ok": True,
        "completed": False,
        "order_uuid": order.order_uuid,
        "confirmation_url": confirmation_url,
        "message": "Перейдите к оплате",
    }


def _payment_config(method: str) -> tuple[str, str | None, str]:
    mapping: dict[str, tuple[str, str | None, str]] = {
        "sbp": ("yookassa", "sbp", "СБП (ЮMoney)"),
        "yoomoney": ("yookassa", "sbp", "ЮMoney"),
        "yookassa": ("yookassa", "sbp", "ЮKassa"),
        "yookassa_sbp": ("yookassa", "sbp", "СБП через ЮKassa"),
        "yookassa_card": ("yookassa", "card", "Картой через ЮKassa"),
        "card": ("yookassa", "card", "Банковская карта (ЮMoney)"),
        "crypto": ("rollypay", "crypto", "Криптовалюта (RollyPay)"),
        "rollypay": ("rollypay", "crypto", "RollyPay"),
        "xrocket": ("rollypay", "xrocket", "xRocket"),
        "cryptobot": ("rollypay", "cryptobot", "CryptoBot"),
    }
    if method in mapping:
        return mapping[method]
    return ("yookassa", "sbp", "СБП (ЮMoney)")


async def _sync_user_notifications(
    session: AsyncSession,
    user: User,
    sub: VPNSubscription | None,
    devices: list[dict[str, Any]],
    *,
    service_online: bool,
) -> None:
    result = await session.execute(
        select(UserNotification.event_key).where(UserNotification.user_id == user.id)
    )
    existing = set(result.scalars().all())
    candidates: list[tuple[str, str, str, str]] = []

    if sub is not None:
        days = _days_left(sub)
        if days is not None and days <= 7:
            candidates.append(
                (
                    f"expiry:{sub.subscription_uuid}:{_iso(sub.expires_at)}",
                    "warning" if days > 0 else "danger",
                    "Подписка заканчивается",
                    "Сегодня последний день" if days == 0 else f"Осталось {days} дн.",
                )
            )
        limit = int(sub.traffic_limit_bytes or 0)
        used = int(sub.traffic_used_bytes or 0)
        if limit > 0:
            percent = min(round(used / limit * 100), 100)
            threshold = 95 if percent >= 95 else 80 if percent >= 80 else 0
            if threshold:
                candidates.append(
                    (
                        f"traffic:{sub.subscription_uuid}:{threshold}",
                        "danger" if threshold >= 95 else "warning",
                        "Заканчивается трафик",
                        f"Использовано {percent}% доступного объёма.",
                    )
                )
        if sub.auto_renew_enabled:
            candidates.append(
                (
                    f"auto-renew:{sub.subscription_uuid}",
                    "success",
                    "Автопродление включено",
                    "Проверьте баланс до окончания подписки.",
                )
            )

    for device in devices:
        device_id = str(_first(device, "id", "device_id", default="")).strip()
        if device_id:
            candidates.append(
                (
                    f"device:{device_id}",
                    "info",
                    "Устройство подключено",
                    str(_first(device, "name", "device_name", default="Новое устройство")),
                )
            )

    if not service_online:
        candidates.append(
            (
                f"service-offline:{date.today().isoformat()}",
                "danger",
                "Сервис временно недоступен",
                "Мы уже видим проблему. Попробуйте обновить данные позже.",
            )
        )

    for event_key, kind, title, body in candidates:
        if event_key in existing:
            continue
        session.add(
            UserNotification(
                user_id=user.id,
                event_key=event_key,
                kind=kind,
                title=title,
                body=body,
            )
        )
    await session.flush()


async def _list_user_notifications(
    session: AsyncSession,
    user_id: int,
    *,
    limit: int,
) -> list[UserNotification]:
    result = await session.execute(
        select(UserNotification)
        .where(UserNotification.user_id == user_id)
        .order_by(UserNotification.created_at.desc(), UserNotification.id.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


def _serialize_user(user: User, identity: MiniAppIdentity) -> dict[str, Any]:
    return {
        "id": user.id,
        "telegram_id": user.telegram_id,
        "username": user.username,
        "first_name": user.first_name or "Пользователь",
        "balance": float(user.balance or 0),
        "currency": user.balance_currency,
        "trial_claimed": user.trial_claimed,
        "preferred_payment_method": user.preferred_payment_method,
        "referral_earned": float(user.referral_earned or 0),
        "is_admin": identity.is_admin or is_admin_role(user),
        "admin_role": str(UserRole.OWNER) if identity.is_admin else str(user.role),
        "admin_scopes": ["*"] if identity.is_admin else sorted(has_scope(user, scope) and scope for scope in (
            "overview", "users:read", "users:support", "users:finance", "orders:read",
            "orders:operate", "orders:finance", "marketing", "promos", "campaigns", "exports",
        ) if has_scope(user, scope)),
    }


def _serialize_subscription(
    sub: VPNSubscription,
    devices: list[dict[str, Any]],
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    expires = _aware(sub.expires_at)
    days_left = max(math.ceil((expires - now).total_seconds() / 86400), 0) if expires else None
    return {
        "uuid": sub.subscription_uuid,
        "plan_uuid": sub.plan_uuid,
        "plan_name": sub.plan_name or "Mister VPN",
        "starts_at": _iso(sub.starts_at),
        "expires_at": _iso(sub.expires_at),
        "days_left": days_left,
        "max_devices": sub.max_devices,
        "device_count": len(devices),
        "traffic_used_bytes": int(sub.traffic_used_bytes or 0),
        "traffic_limit_bytes": sub.traffic_limit_bytes,
        "is_active": sub.is_active,
        "is_frozen": sub.is_frozen,
        "is_expired": sub.is_expired,
        "is_trial": sub.is_trial,
        "auto_renew_enabled": sub.auto_renew_enabled,
        "subscription_url": sub.subscription_url or upstream_subscription_url(sub.subscription_uuid),
        "direct_url": sub.subscription_url or upstream_subscription_url(sub.subscription_uuid),
        "public_url": public_subscription_url(sub.subscription_uuid) if settings.public_base_url else (sub.subscription_url or upstream_subscription_url(sub.subscription_uuid)),
        "management_url": f"/s/{sub.subscription_uuid}",
    }


def _serialize_plan(plan: VPNPlanSnapshot, *, admin: bool = False) -> dict[str, Any]:
    result = {
        "uuid": plan.plan_uuid,
        "name": plan.name,
        "price": float(plan.retail_price) if plan.retail_price is not None else None,
        "currency": plan.currency,
        "duration_days": plan.duration_days,
        "max_devices": plan.max_devices,
        "traffic_limit_bytes": plan.traffic_limit_bytes,
        "period_group": plan.period_group or "other",
        "is_public": plan.is_public,
        "is_active": plan.is_active,
        "is_trial": plan.is_trial,
        "button_style": plan.button_style,
    }
    if admin:
        result["purchase_price"] = (
            float(plan.purchase_price) if plan.purchase_price is not None else None
        )
        result["manual_price"] = plan.manual_price
    return result


def _serialize_device(device: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(_first(device, "id", "device_id", default="")),
        "name": str(_first(device, "name", "device_name", "device_model", default="Устройство")),
        "os": _first(device, "device_os", "os", "platform"),
        "model": _first(device, "device_model", "model"),
        "hwid": _first(device, "hwid", "hardware_id"),
        "ip": _first(device, "ip_address", "ip"),
        "last_seen": _first(device, "last_seen", "last_active", "updated_at"),
    }


def _serialize_connection(item: dict[str, Any]) -> dict[str, Any]:
    success = _first(item, "success", "is_success", "allowed", default=True)
    return {
        "id": str(_first(item, "id", "request_id", default="")),
        "device": str(_first(item, "hwid", "device_id", "device", default="Неизвестное устройство")),
        "ip": _first(item, "ip_address", "ip", "client_ip"),
        "country": _first(item, "country", "country_code"),
        "created_at": _first(item, "created_at", "timestamp", "date"),
        "success": bool(success),
        "error": _first(item, "error", "message"),
    }


def _serialize_order(order: Order, *, owner: User | None = None) -> dict[str, Any]:
    payload = {
        "uuid": order.order_uuid,
        "type": str(order.order_type),
        "status": str(order.status),
        "amount": float(order.amount or 0),
        "currency": order.currency,
        "payment_provider": order.payment_provider,
        "subscription_uuid": order.subscription_uuid,
        "needs_manual_review": order.needs_manual_review,
        "error": order.error_text,
        "created_at": _iso(order.created_at),
        "paid_at": _iso(order.paid_at),
        "completed_at": _iso(order.completed_at),
        "snapshot": {
            "plan_name": (order.snapshot or {}).get("plan_name"),
            "payment_method": (order.snapshot or {}).get("payment_method"),
            "auto_renew": bool((order.snapshot or {}).get("auto_renew")),
            "recipient_name": (order.snapshot or {}).get("recipient_name"),
        },
    }
    if owner is not None:
        payload["owner"] = {
            "id": owner.id,
            "telegram_id": owner.telegram_id,
            "username": owner.username,
            "first_name": owner.first_name or "Пользователь",
        }
    return payload


def _serialize_order_details(order: Order, *, owner: User | None = None) -> dict[str, Any]:
    payload = _serialize_order(order, owner=owner)
    payload.update(
        {
            "payment_id": order.payment_id,
            "idempotency_key": order.idempotency_key,
            "snapshot": dict(order.snapshot or {}),
        }
    )
    return payload


def _serialize_notification(notification: UserNotification) -> dict[str, Any]:
    return {
        "id": notification.id,
        "kind": notification.kind,
        "title": notification.title,
        "body": notification.body,
        "created_at": _iso(notification.created_at),
        "read": notification.read_at is not None,
    }


def _serialize_ticket(ticket: SupportTicket) -> dict[str, Any]:
    return {
        "uuid": ticket.ticket_uuid,
        "category": ticket.category,
        "message": ticket.message,
        "status": ticket.status,
        "reply": ticket.admin_reply,
        "created_at": _iso(ticket.created_at),
        "updated_at": _iso(ticket.updated_at),
    }


def _serialize_trial_offer(plan: VPNPlanSnapshot | None) -> dict[str, Any] | None:
    """Free-trial card shown on the home screen until the user claims it."""
    if plan is None:
        return None
    return {
        "plan_uuid": plan.plan_uuid,
        "name": plan.name,
        "days": plan.duration_days,
        "max_devices": plan.max_devices,
    }


def _serialize_promo(promo: PromoCode) -> dict[str, Any]:
    max_uses = promo.max_uses
    expires_at = _aware(promo.expires_at)
    now = datetime.now(timezone.utc)
    exhausted = max_uses is not None and promo.used_count >= max_uses
    expired = expires_at is not None and expires_at <= now
    return {
        "code": promo.code,
        "amount": float(promo.amount or 0),
        "currency": promo.currency,
        "max_uses": max_uses,
        "used_count": promo.used_count,
        "uses_left": None if max_uses is None else max(max_uses - promo.used_count, 0),
        "is_active": promo.is_active,
        "is_usable": promo.is_active and not exhausted and not expired,
        "expires_at": _iso(promo.expires_at),
        "created_at": _iso(promo.created_at),
        "audience": promo.audience,
        "per_user_limit": promo.per_user_limit,
        "redemptions": [
            {
                "user_id": item.user_id,
                "amount": float(item.amount),
                "created_at": _iso(item.created_at),
            }
            for item in promo.redemptions[-20:]
        ],
    }


def _serialize_admin_user(user: User, sub: VPNSubscription | None) -> dict[str, Any]:
    return {
        "id": user.id,
        "telegram_id": user.telegram_id,
        "username": user.username,
        "first_name": user.first_name or "Пользователь",
        "balance": float(user.balance or 0),
        "currency": user.balance_currency,
        "is_blocked": user.is_blocked,
        "role": str(user.role),
        "created_at": _iso(user.created_at),
        "last_activity_at": _iso(user.last_activity_at),
        "note": user.admin_note,
        "tags": user.admin_tags or [],
        "subscription": _serialize_subscription(sub, []) if sub else None,
    }


def _serialize_audit(item: AdminAuditLog) -> dict[str, Any]:
    return {
        "id": item.id,
        "admin_user_id": item.admin_user_id,
        "action": item.action,
        "target_type": item.target_type,
        "target_id": item.target_id,
        "summary": item.summary,
        "details": item.details or {},
        "created_at": _iso(item.created_at),
    }


def _serialize_task(item: AdminTask) -> dict[str, Any]:
    return {
        "uuid": item.task_uuid,
        "type": item.task_type,
        "status": item.status,
        "priority": item.priority,
        "title": item.title,
        "target_type": item.target_type,
        "target_id": item.target_id,
        "details": item.details or {},
        "created_at": _iso(item.created_at),
        "resolved_at": _iso(item.resolved_at),
    }


def _serialize_campaign(item: AdminCampaign) -> dict[str, Any]:
    return {
        "uuid": item.campaign_uuid,
        "name": item.name,
        "kind": item.kind,
        "status": item.status,
        "audience": item.audience,
        "trigger_type": item.trigger_type,
        "text": item.text,
        "image_url": item.image_url,
        "button_text": item.button_text,
        "button_url": item.button_url,
        "schedule_at": _iso(item.schedule_at),
        "last_run_at": _iso(item.last_run_at),
        "created_at": _iso(item.created_at),
    }


def _serialize_template(item: BroadcastTemplate) -> dict[str, Any]:
    return {
        "id": item.id,
        "name": item.name,
        "text": item.text,
        "image_url": item.image_url,
        "button_text": item.button_text,
        "button_url": item.button_url,
        "created_at": _iso(item.created_at),
    }


def _validate_button(button_text: str | None, button_url: str | None) -> None:
    if bool(button_text) != bool(button_url):
        raise HTTPException(400, "Для кнопки нужны и текст, и ссылка")
    if button_url and not button_url.lower().startswith(("https://", "http://", "tg://")):
        raise HTTPException(400, "Ссылка кнопки должна начинаться с https://, http:// или tg://")


def _csv_safe(value: Any) -> str:
    text = "" if value is None else str(value)
    if text.startswith(("=", "+", "-", "@")):
        return f"'{text}"
    return text


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return _aware(value).isoformat()


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _safe_error(exc: Exception) -> str:
    message = str(exc).strip()
    return message[:240] if message else "Сервис временно недоступен"
