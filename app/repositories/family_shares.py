"""FamilySlotShare repository."""
from __future__ import annotations

from sqlalchemy import select, func

from app.db.models.family_share import FamilySlotShare
from app.repositories.base import BaseRepository


class FamilyShareRepository(BaseRepository):
    async def get_by_id(self, share_id: int) -> FamilySlotShare | None:
        res = await self.session.execute(
            select(FamilySlotShare).where(FamilySlotShare.id == share_id)
        )
        return res.scalar_one_or_none()

    async def get_by_token(self, token: str) -> FamilySlotShare | None:
        res = await self.session.execute(
            select(FamilySlotShare).where(FamilySlotShare.token == token)
        )
        return res.scalar_one_or_none()

    async def list_for_owner(self, owner_user_id: int) -> list[FamilySlotShare]:
        res = await self.session.execute(
            select(FamilySlotShare)
            .where(FamilySlotShare.owner_user_id == owner_user_id)
            .order_by(FamilySlotShare.created_at.desc())
        )
        return list(res.scalars().all())

    async def list_active_for_owner(self, owner_user_id: int) -> list[FamilySlotShare]:
        res = await self.session.execute(
            select(FamilySlotShare)
            .where(
                FamilySlotShare.owner_user_id == owner_user_id,
                FamilySlotShare.status == "active",
            )
            .order_by(FamilySlotShare.created_at.desc())
        )
        return list(res.scalars().all())

    async def count_active_for_owner(self, owner_user_id: int) -> int:
        res = await self.session.execute(
            select(func.count())
            .select_from(FamilySlotShare)
            .where(
                FamilySlotShare.owner_user_id == owner_user_id,
                FamilySlotShare.status == "active",
            )
        )
        return res.scalar_one() or 0

    def add(self, share: FamilySlotShare) -> None:
        self.session.add(share)
