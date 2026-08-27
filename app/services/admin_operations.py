"""Admin permissions, audit logging, and persistent campaign delivery."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import OrderStatus, UserRole
from app.core.logging import get_logger
from app.db.database import async_session_factory
from app.db.models.admin_operations import AdminAuditLog, AdminCampaign, CampaignDelivery
from app.db.models.order import Order
from app.db.models.subscription import VPNSubscription
from app.db.models.user import User

logger = get_logger(__name__)

ADMIN_ROLES = {
    UserRole.ADMIN,
    UserRole.OWNER,
    UserRole.SUPPORT,
    UserRole.FINANCE,
    UserRole.MARKETING,
}

ROLE_SCOPES: dict[str, frozenset[str]] = {
    UserRole.ADMIN: frozenset({"*"}),
    UserRole.OWNER: frozenset({"*"}),
    UserRole.SUPPORT: frozenset({"overview", "users:read", "users:support", "orders:read", "orders:operate", "tickets"}),
    UserRole.FINANCE: frozenset({"overview", "users:read", "users:finance", "orders:read", "orders:finance", "exports"}),
    UserRole.MARKETING: frozenset({"overview", "users:read", "marketing", "promos", "campaigns", "exports"}),
}


def role_value(user: User) -> str:
    return str(user.role or UserRole.USER)


def is_admin_role(user: User) -> bool:
    return role_value(user) in {str(role) for role in ADMIN_ROLES}


def has_scope(user: User, scope: str) -> bool:
    scopes = ROLE_SCOPES.get(role_value(user), frozenset())
    return "*" in scopes or scope in scopes


async def write_audit(
    session: AsyncSession,
    admin: User | None,
    *,
    action: str,
    target_type: str,
    target_id: str | int,
    summary: str,
    details: dict[str, Any] | None = None,
) -> AdminAuditLog:
    entry = AdminAuditLog(
        admin_user_id=admin.id if admin else None,
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        summary=summary[:240],
        details=details or {},
    )
    session.add(entry)
    await session.flush()
    return entry


async def run_admin_campaign_loop(bot: Bot) -> None:
    while True:
        try:
            await process_due_campaigns(bot)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Admin campaign check failed")
        await asyncio.sleep(60)


async def process_due_campaigns(bot: Bot) -> int:
    now = datetime.now(timezone.utc)
    sent = 0
    async with async_session_factory() as session:
        result = await session.execute(
            select(AdminCampaign)
            .where(AdminCampaign.status.in_(["active", "scheduled"]))
            .where(or_(AdminCampaign.schedule_at.is_(None), AdminCampaign.schedule_at <= now))
            .order_by(AdminCampaign.created_at)
        )
        for campaign in result.scalars().all():
            users = await _campaign_users(session, campaign)
            delivered_result = await session.execute(
                select(CampaignDelivery.user_id).where(CampaignDelivery.campaign_id == campaign.id)
            )
            delivered = set(delivered_result.scalars().all())
            for user in users:
                if user.id in delivered:
                    continue
                delivery = CampaignDelivery(campaign_id=campaign.id, user_id=user.id)
                try:
                    await _send_campaign(bot, user.telegram_id, campaign)
                    delivery.status = "sent"
                    sent += 1
                except Exception as exc:  # noqa: BLE001
                    delivery.status = "failed"
                    delivery.error_text = str(exc)[:1000]
                session.add(delivery)
                await asyncio.sleep(0.05)
            campaign.last_run_at = now
            if campaign.kind == "manual":
                campaign.status = "completed"
        await session.commit()
    return sent


async def _campaign_users(session: AsyncSession, campaign: AdminCampaign) -> list[User]:
    now = datetime.now(timezone.utc)
    stmt = select(User).where(User.is_blocked.is_(False))
    audience = campaign.trigger_type or campaign.audience
    active_sub = exists(select(VPNSubscription.id).where(
        VPNSubscription.user_id == User.id,
        VPNSubscription.is_active.is_(True),
        VPNSubscription.is_frozen.is_(False),
        or_(VPNSubscription.expires_at.is_(None), VPNSubscription.expires_at > now),
    ))
    if audience == "active":
        stmt = stmt.where(active_sub)
    elif audience in {"expiring", "expiring_3d"}:
        days = 3 if audience == "expiring_3d" else 7
        stmt = stmt.where(exists(select(VPNSubscription.id).where(
            VPNSubscription.user_id == User.id,
            VPNSubscription.is_active.is_(True),
            VPNSubscription.expires_at > now,
            VPNSubscription.expires_at <= now + timedelta(days=days),
        )))
    elif audience == "no_subscription":
        stmt = stmt.where(~active_sub)
    elif audience == "no_subscription_3d":
        stmt = stmt.where(~active_sub, User.created_at <= now - timedelta(days=3))
    elif audience == "inactive_30d":
        stmt = stmt.where(User.last_activity_at <= now - timedelta(days=30))
    elif audience == "failed_payment":
        stmt = stmt.where(exists(select(Order.id).where(
            Order.user_id == User.id,
            Order.status.in_([OrderStatus.FAILED, OrderStatus.CANCELLED]),
            Order.created_at >= now - timedelta(days=7),
        )))
    result = await session.execute(stmt.order_by(User.id))
    return list(result.scalars().all())


async def _send_campaign(bot: Bot, telegram_id: int, campaign: AdminCampaign) -> None:
    markup = None
    if campaign.button_text and campaign.button_url:
        markup = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(
            text=campaign.button_text, url=campaign.button_url
        )]])
    if campaign.image_url:
        await bot.send_photo(telegram_id, photo=campaign.image_url, caption=campaign.text, reply_markup=markup)
    else:
        await bot.send_message(telegram_id, campaign.text, reply_markup=markup)
