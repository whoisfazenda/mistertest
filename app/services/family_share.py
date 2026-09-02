"""FamilyShareService — manages device slot sharing for subscriptions."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import httpx

from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.adaptgroup import AdaptGroupClient
from app.core.config import settings
from app.core.logging import get_logger
from app.db.models.family_share import FamilySlotShare
from app.repositories.family_shares import FamilyShareRepository
from app.repositories.subscriptions import SubscriptionRepository
from app.services.subscriptions import SubscriptionService

logger = get_logger(__name__)


class FamilyShareService:
    def __init__(self, session: AsyncSession, client: AdaptGroupClient | None = None) -> None:
        self.session = session
        self.client = client
        self.shares_repo = FamilyShareRepository(session)
        self.subs_repo = SubscriptionRepository(session)

    async def get_family_slots_summary(self, owner_user_id: int) -> dict[str, Any]:
        """Calculate total, used, shared, and available device slots for owner."""
        sub = await self.subs_repo.get_active_for_user(owner_user_id)
        if sub is None or not sub.is_effectively_active:
            return {
                "has_subscription": False,
                "total_slots": 0,
                "used_slots": 0,
                "available_slots": 0,
                "shares": [],
            }

        max_devices = sub.max_devices or 1

        # Fetch active devices from AdaptGroup if client is available
        device_count = 0
        if self.client:
            try:
                sub_service = SubscriptionService(self.session, self.client)
                devices = await sub_service.get_devices(sub)
                device_count = len(devices)
            except Exception as exc:
                logger.warning("Could not fetch devices for sub %s: %s", sub.subscription_uuid, exc)

        all_shares = await self.shares_repo.list_for_owner(owner_user_id)
        active_shares = [s for s in all_shares if s.status == "active"]

        # Reserve at least 1 slot for owner's primary device
        available_slots = max(0, max_devices - len(active_shares) - 1)

        bot_username = "misterfvpn_bot"
        sub_base = (settings.subscription_base_url or "https://sub.misterv.site").rstrip("/")

        serialized_shares = []
        for s in all_shares:
            serialized_shares.append({
                "id": s.id,
                "token": s.token,
                "label": s.label,
                "status": s.status,
                "claimed_by_telegram_id": s.claimed_by_telegram_id,
                "claimed_by_username": s.claimed_by_username,
                "claimed_at": s.claimed_at.isoformat() if s.claimed_at else None,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "invite_bot_url": f"https://t.me/{bot_username}?start=fshare_{s.token}",
                "invite_direct_url": f"{sub_base}/share/{s.token}",
            })

        return {
            "has_subscription": True,
            "subscription_uuid": sub.subscription_uuid,
            "plan_name": sub.plan_name or "Mister VPN",
            "total_slots": max_devices,
            "used_devices": device_count,
            "active_shares_count": len(active_shares),
            "available_slots": available_slots,
            "shares": serialized_shares,
        }

    async def create_slot(self, owner_user_id: int, label: str = "Семейный слот") -> FamilySlotShare:
        """Create a new shared slot if within device limits."""
        sub = await self.subs_repo.get_active_for_user(owner_user_id)
        if sub is None or not sub.is_effectively_active:
            raise ValueError("У вас нет активной подписки для создания семейного слота")

        summary = await self.get_family_slots_summary(owner_user_id)
        if summary["available_slots"] <= 0:
            raise ValueError(
                f"Все слоты заняты ({summary['total_slots']} из {summary['total_slots']}). "
                "Отозовите неиспользуемый слот или перейдите на тариф с большим количеством устройств."
            )

        clean_label = label.strip()[:64] if label.strip() else "Семейный слот"
        share = FamilySlotShare(
            owner_user_id=owner_user_id,
            subscription_id=sub.id,
            label=clean_label,
            status="active",
        )
        self.shares_repo.add(share)
        await self.session.commit()
        await self.session.refresh(share)
        return share

    async def revoke_slot(self, owner_user_id: int, share_id: int) -> bool:
        """Revoke a shared slot and disconnect the device."""
        share = await self.shares_repo.get_by_id(share_id)
        if share is None or share.owner_user_id != owner_user_id:
            raise ValueError("Семейный слот не найден")

        share.status = "revoked"

        # If we have client and bound device, delete it from upstream
        if self.client and share.subscription and share.bound_device_id:
            try:
                await self.client.delete_device(
                    share.subscription.subscription_uuid,
                    share.bound_device_id,
                )
            except Exception as exc:
                logger.warning("Failed to delete device on slot revoke: %s", exc)

        await self.session.commit()
        return True

    async def claim_slot(
        self, token: str, telegram_id: int, username: str | None = None
    ) -> FamilySlotShare | None:
        """Claim a shared slot by a family member/friend."""
        share = await self.shares_repo.get_by_token(token)
        if share is None or share.status != "active":
            return None

        share.claimed_by_telegram_id = telegram_id
        share.claimed_by_username = username
        share.claimed_at = datetime.now(timezone.utc)
        await self.session.commit()
        await self.session.refresh(share)
        return share

    async def get_slot_configs(self, token: str) -> str | None:
        """Fetch raw subscription configs for an active shared slot."""
        share = await self.shares_repo.get_by_token(token)
        if share is None or share.status != "active":
            return None

        sub = share.subscription
        if sub is None or not sub.is_effectively_active:
            return None

        direct_url = sub.subscription_url or f"https://network-api.adaptgroup.app/sub/{sub.subscription_uuid}"
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as h_client:
                res = await h_client.get(direct_url)
                if res.status_code < 400:
                    return res.text
        except Exception as exc:
            logger.warning("Error fetching configs for shared slot %s: %s", token, exc)

        return None
