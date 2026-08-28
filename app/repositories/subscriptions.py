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
        """Return the most relevant subscription for a user."""
        res = await self.session.execute(
            select(VPNSubscription)
            .where(VPNSubscription.user_id == user_id)
            .order_by(VPNSubscription.is_active.desc(), VPNSubscription.created_at.desc())
        )
        subs = list(res.scalars().all())
        if not subs:
            return None
        now = datetime.now(timezone.utc)
        for s in subs:
            exp = s.expires_at
            if exp is not None and exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if s.is_active and (exp is None or exp > now):
                return s
        return subs[0]

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
