"""Balance-backed automatic subscription renewal."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from aiogram import Bot
from sqlalchemy import select

from app.bot.deps import get_client, get_payments
from app.core.enums import OrderStatus, OrderType
from app.core.logging import get_logger
from app.db.database import async_session_factory
from app.db.models.order import Order
from app.db.models.plan import VPNPlanSnapshot
from app.db.models.subscription import VPNSubscription
from app.services.orders import OrderService

logger = get_logger(__name__)

AUTO_RENEW_CHECK_INTERVAL_SECONDS = 30 * 60
AUTO_RENEW_WINDOW = timedelta(hours=24)


async def run_auto_renew_loop(bot: Bot) -> None:
    """Periodically renew subscriptions that expire within 24 hours."""
    while True:
        try:
            await process_due_auto_renewals(bot)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Auto-renew check failed")
        await asyncio.sleep(AUTO_RENEW_CHECK_INTERVAL_SECONDS)


async def process_due_auto_renewals(bot: Bot | None = None) -> int:
    """Attempt due renewals and return the number successfully provisioned."""
    now = datetime.now(timezone.utc)
    renewed = 0
    async with async_session_factory() as session:
        result = await session.execute(
            select(VPNSubscription)
            .where(VPNSubscription.auto_renew_enabled.is_(True))
            .where(VPNSubscription.is_active.is_(True))
            .where(VPNSubscription.is_frozen.is_(False))
            .where(VPNSubscription.is_trial.is_(False))
            .where(VPNSubscription.expires_at.is_not(None))
            .where(VPNSubscription.expires_at > now)
            .where(VPNSubscription.expires_at <= now + AUTO_RENEW_WINDOW)
        )
        subscriptions = list(result.scalars().all())

        for sub in subscriptions:
            if not sub.plan_uuid:
                continue
            plan_result = await session.execute(
                select(VPNPlanSnapshot).where(
                    VPNPlanSnapshot.plan_uuid == sub.plan_uuid
                )
            )
            plan = plan_result.scalar_one_or_none()
            if plan is None or plan.retail_price is None or not plan.is_active:
                continue

            order_service = OrderService(session, get_client(), get_payments())
            order = await _pending_auto_renew_order(session, sub)
            if order is None:
                order = await order_service.create_action_order(
                    sub.user_id,
                    OrderType.RENEW,
                    sub.subscription_uuid,
                    amount=Decimal(str(plan.retail_price)),
                    currency=plan.currency,
                    extra={
                        "auto_renew": True,
                        "plan_uuid": plan.plan_uuid,
                        "plan_name": plan.name,
                    },
                )

            if not await order_service.pay_from_balance(order):
                await _notify_once(
                    bot,
                    order,
                    "auto_renew_balance_notice",
                    "⚠️ <b>Для автопродления не хватает средств</b>\n\n"
                    f"Пополните баланс минимум на {float(order.amount):.2f} {order.currency}. "
                    "Автопродление повторит попытку автоматически.",
                )
                continue

            outcome = await order_service.provision(order)
            if outcome.provisioned or outcome.already_done:
                renewed += 1
                await _notify_once(
                    bot,
                    order,
                    "auto_renew_success_notice",
                    "✅ <b>VPN продлён автоматически</b>\n\n"
                    f"С баланса списано {float(order.amount):.2f} {order.currency}.",
                )
            elif outcome.error:
                logger.warning(
                    "Auto-renew provisioning failed for subscription %s: %s",
                    sub.subscription_uuid,
                    outcome.error,
                )
        await session.commit()
    return renewed


async def _pending_auto_renew_order(
    session,
    sub: VPNSubscription,
) -> Order | None:
    result = await session.execute(
        select(Order)
        .where(Order.user_id == sub.user_id)
        .where(Order.subscription_uuid == sub.subscription_uuid)
        .where(Order.order_type == OrderType.RENEW)
        .where(Order.status == OrderStatus.PENDING)
        .order_by(Order.created_at.desc())
        .limit(10)
    )
    for order in result.scalars().all():
        if bool((order.snapshot or {}).get("auto_renew")):
            return order
    return None


async def _notify_once(
    bot: Bot | None,
    order: Order,
    snapshot_key: str,
    text: str,
) -> None:
    if bot is None or (order.snapshot or {}).get(snapshot_key):
        return
    try:
        await bot.send_message(order.user.telegram_id, text)
    except Exception:
        logger.exception("Failed to send auto-renew notice")
        return
    snapshot = dict(order.snapshot or {})
    snapshot[snapshot_key] = True
    order.snapshot = snapshot
