"""Subscription repository."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import or_
from sqlalchemy import func, select

from app.db.models.subscription import VPNSubscription
from app.repositories.base import BaseRepository


class SubscriptionRepository(BaseRepository):
    async def get_by_uuid(self, subscription_uuid: str) -> VPNSubscription | None:
        res = await self.session.execute(
            select(VPNSubscription).where(
                VPNSubscription.subscription_uuid == subscription_uuid
            )
        )
        return res.scalar_one_or_none()

    async def get_active_for_user(self, user_id: int) -> VPNSubscription | None:
        """Return the most relevant subscription for a user (active/non-expired first, then latest)."""
        now = datetime.now(timezone.utc)
        # 1. Try to find currently active and non-expired subscription
        res = await self.session.execute(
            select(VPNSubscription)
            .where(VPNSubscription.user_id == user_id)
            .where(VPNSubscription.is_active.is_(True))
            .where(
                or_(
                    VPNSubscription.expires_at.is_(None),
                    VPNSubscription.expires_at > now,
                )
            )
            .order_by(VPNSubscription.expires_at.desc().nullslast(), VPNSubscription.created_at.desc())
            .limit(1)
        )
        active_sub = res.scalar_one_or_none()
        if active_sub is not None:
            return active_sub

        # 2. Fallback to latest subscription
        res = await self.session.execute(
            select(VPNSubscription)
            .where(VPNSubscription.user_id == user_id)
            .order_by(VPNSubscription.created_at.desc())
            .limit(1)
        )
        return res.scalar_one_or_none()

    async def list_for_user(self, user_id: int) -> list[VPNSubscription]:
        res = await self.session.execute(
            select(VPNSubscription)
            .where(VPNSubscription.user_id == user_id)
            .order_by(VPNSubscription.created_at.desc())
        )
        return list(res.scalars().all())

    def add(self, subscription: VPNSubscription) -> None:
        self.session.add(subscription)

    async def count_active(self) -> int:
        now = datetime.now(timezone.utc)
        res = await self.session.execute(
            select(func.count())
            .select_from(VPNSubscription)
            .where(VPNSubscription.is_active.is_(True))
            .where(VPNSubscription.is_frozen.is_(False))
            .where(
                or_(
                    VPNSubscription.expires_at.is_(None),
                    VPNSubscription.expires_at > now,
                )
            )
        )
        return int(res.scalar_one())

    async def count_expiring_within(self, days: int) -> int:
        now = datetime.now(timezone.utc)
        until = now + timedelta(days=days)
        res = await self.session.execute(
            select(func.count())
            .select_from(VPNSubscription)
            .where(VPNSubscription.is_active.is_(True))
            .where(VPNSubscription.is_frozen.is_(False))
            .where(VPNSubscription.expires_at > now)
            .where(VPNSubscription.expires_at <= until)
        )
        return int(res.scalar_one())
