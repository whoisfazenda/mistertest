"""Promo code repository."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.db.models.promo import PromoCode, PromoRedemption
from app.db.models.subscription import VPNSubscription
from app.db.models.user import User
from app.repositories.base import BaseRepository


class PromoRepository(BaseRepository):
    async def create(
        self,
        *,
        code: str,
        amount: Decimal,
        max_uses: int | None,
        expires_at: datetime | None,
        created_by_user_id: int | None,
        audience: str = "all",
        per_user_limit: int = 1,
    ) -> PromoCode:
        promo = PromoCode(
            code=code.upper(),
            amount=amount,
            currency=settings.currency,
            max_uses=max_uses,
            expires_at=expires_at,
            created_by_user_id=created_by_user_id,
            audience=audience,
            per_user_limit=per_user_limit,
        )
        self.session.add(promo)
        await self.session.flush()
        return promo

    async def get_by_code(self, code: str) -> PromoCode | None:
        res = await self.session.execute(
            select(PromoCode).where(PromoCode.code == code.upper())
        )
        return res.scalar_one_or_none()

    async def list_recent(self, limit: int = 20) -> list[PromoCode]:
        res = await self.session.execute(
            select(PromoCode).order_by(PromoCode.created_at.desc()).limit(limit)
        )
        return list(res.scalars().all())

    async def count_active(self) -> int:
        now = datetime.now(timezone.utc)
        res = await self.session.execute(
            select(func.count())
            .select_from(PromoCode)
            .where(PromoCode.is_active.is_(True))
            .where((PromoCode.expires_at.is_(None)) | (PromoCode.expires_at > now))
        )
        return int(res.scalar_one())

    async def has_redeemed(self, promo_id: int, user_id: int) -> bool:
        return await self.redemption_count(promo_id, user_id) > 0

    async def redemption_count(self, promo_id: int, user_id: int) -> int:
        res = await self.session.execute(
            select(func.count())
            .select_from(PromoRedemption)
            .where(PromoRedemption.promo_code_id == promo_id)
            .where(PromoRedemption.user_id == user_id)
        )
        return int(res.scalar_one())

    async def redeem(self, promo: PromoCode, user: User) -> tuple[bool, str]:
        now = datetime.now(timezone.utc)
        if not promo.is_active:
            return False, "Промокод отключён."
        if promo.expires_at is not None and _aware_utc(promo.expires_at) < now:
            return False, "Срок действия промокода закончился."
        if promo.max_uses is not None and promo.used_count >= promo.max_uses:
            return False, "Лимит использований промокода закончился."
        if not await self._audience_matches(promo, user):
            return False, "Промокод недоступен для этого аккаунта."
        if await self.redemption_count(promo.id, user.id) >= promo.per_user_limit:
            return False, "Вы уже активировали этот промокод."

        amount = Decimal(str(promo.amount))
        redemption = PromoRedemption(
            promo_code_id=promo.id,
            user_id=user.id,
            amount=amount,
            currency=promo.currency,
        )
        self.session.add(redemption)
        promo.used_count += 1
        user.balance = Decimal(str(user.balance or 0)) + amount
        user.balance_currency = promo.currency
        try:
            await self.session.flush()
        except IntegrityError:
            await self.session.rollback()
            return False, "Вы уже активировали этот промокод."
        return True, ""

    async def _audience_matches(self, promo: PromoCode, user: User) -> bool:
        audience = promo.audience or "all"
        if audience == "all":
            return True
        now = datetime.now(timezone.utc)
        active_result = await self.session.execute(
            select(VPNSubscription.id)
            .where(VPNSubscription.user_id == user.id)
            .where(VPNSubscription.is_active.is_(True))
            .where(or_(VPNSubscription.expires_at.is_(None), VPNSubscription.expires_at > now))
            .limit(1)
        )
        has_active = active_result.scalar_one_or_none() is not None
        if audience == "active":
            return has_active
        if audience == "no_subscription":
            return not has_active
        if audience == "new_users":
            created_at = user.created_at
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            return created_at >= now - timedelta(days=7)
        return False


def _aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
