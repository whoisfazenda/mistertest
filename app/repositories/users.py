"""User repository."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import String, cast, exists, func, or_, select
from sqlalchemy.exc import IntegrityError

from app.db.models.user import User
from app.db.models.subscription import VPNSubscription
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository):
    async def get_by_id(self, user_id: int) -> User | None:
        res = await self.session.execute(select(User).where(User.id == user_id))
        return res.scalar_one_or_none()

    async def get_by_telegram_id(self, telegram_id: int) -> User | None:
        res = await self.session.execute(
            select(User).where(User.telegram_id == telegram_id)
        )
        return res.scalar_one_or_none()

    async def get_or_create(
        self,
        telegram_id: int,
        username: str | None = None,
        first_name: str | None = None,
        language: str = "ru",
    ) -> User:
        user = await self.get_by_telegram_id(telegram_id)
        if user is None:
            user = User(
                telegram_id=telegram_id,
                username=username,
                first_name=first_name,
                language=language,
            )
            self.session.add(user)
            try:
                await self.session.flush()
            except IntegrityError:
                await self.session.rollback()
                user = await self.get_by_telegram_id(telegram_id)
                if user is None:
                    raise
        else:
            # keep profile fresh
            changed = False
            if username is not None and user.username != username:
                user.username = username
                changed = True
            if first_name is not None and user.first_name != first_name:
                user.first_name = first_name
                changed = True
            user.last_activity_at = datetime.now(timezone.utc)
            if changed:
                await self.session.flush()
        return user

    async def touch_activity(self, user: User) -> None:
        user.last_activity_at = datetime.now(timezone.utc)

    async def count(self) -> int:
        res = await self.session.execute(select(func.count()).select_from(User))
        return int(res.scalar_one())

    async def count_created_since(self, since: datetime) -> int:
        res = await self.session.execute(
            select(func.count()).select_from(User).where(User.created_at >= since)
        )
        return int(res.scalar_one())

    async def all_telegram_ids(self, only_unblocked: bool = True) -> list[int]:
        stmt = select(User.telegram_id)
        if only_unblocked:
            stmt = stmt.where(User.is_blocked.is_(False))
        res = await self.session.execute(stmt)
        return [int(r) for r in res.scalars().all()]

    async def list_recent(self, limit: int = 20) -> list[User]:
        res = await self.session.execute(
            select(User).order_by(User.created_at.desc()).limit(limit)
        )
        return list(res.scalars().all())

    async def list_admin(
        self,
        *,
        segment: str = "all",
        query: str = "",
        limit: int = 30,
        offset: int = 0,
    ) -> list[User]:
        stmt = select(User).order_by(User.last_activity_at.desc(), User.id.desc())
        stmt = self._apply_admin_filters(stmt, segment=segment, query=query)
        res = await self.session.execute(stmt.offset(offset).limit(limit))
        return list(res.scalars().all())

    async def count_admin(self, *, segment: str = "all", query: str = "") -> int:
        stmt = select(func.count()).select_from(User)
        stmt = self._apply_admin_filters(stmt, segment=segment, query=query)
        res = await self.session.execute(stmt)
        return int(res.scalar_one())

    @staticmethod
    def _apply_admin_filters(stmt, *, segment: str, query: str):
        clean_query = query.strip().lstrip("@")
        if clean_query:
            like = f"%{clean_query}%"
            stmt = stmt.where(
                or_(
                    User.username.ilike(like),
                    User.first_name.ilike(like),
                    cast(User.telegram_id, String).like(like),
                )
            )

        now = datetime.now(timezone.utc)
        active_sub = exists(
            select(VPNSubscription.id).where(
                VPNSubscription.user_id == User.id,
                VPNSubscription.is_active.is_(True),
                VPNSubscription.is_frozen.is_(False),
                or_(
                    VPNSubscription.expires_at.is_(None),
                    VPNSubscription.expires_at > now,
                ),
            )
        )
        if segment == "active":
            stmt = stmt.where(active_sub)
        elif segment == "expiring":
            stmt = stmt.where(
                exists(
                    select(VPNSubscription.id).where(
                        VPNSubscription.user_id == User.id,
                        VPNSubscription.is_active.is_(True),
                        VPNSubscription.is_frozen.is_(False),
                        VPNSubscription.expires_at > now,
                        VPNSubscription.expires_at <= now + timedelta(days=7),
                    )
                )
            )
        elif segment == "no_subscription":
            stmt = stmt.where(~active_sub)
        elif segment == "blocked":
            stmt = stmt.where(User.is_blocked.is_(True))
        return stmt
