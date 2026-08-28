"""App settings repository."""
from __future__ import annotations

from sqlalchemy import select

from app.db.models.app_setting import AppSetting
from app.repositories.base import BaseRepository


class SettingsRepository(BaseRepository):
    async def get(self, key: str) -> str | None:
        res = await self.session.execute(
            select(AppSetting.value).where(AppSetting.key == key)
        )
        return res.scalar_one_or_none()

    async def get_all(self) -> dict[str, str]:
        res = await self.session.execute(select(AppSetting))
        return {item.key: item.value or "" for item in res.scalars().all()}

    async def set(self, key: str, value: str | None, description: str | None = None) -> None:
        res = await self.session.execute(
            select(AppSetting).where(AppSetting.key == key)
        )
        obj = res.scalar_one_or_none()
        if obj is None:
            self.session.add(AppSetting(key=key, value=value, description=description))
        else:
            obj.value = value
            if description is not None:
                obj.description = description

    async def bulk_set(self, items: dict[str, str | None]) -> None:
        for k, v in items.items():
            await self.set(k, v)

    async def get_bool(self, key: str, default: bool = False) -> bool:
        val = await self.get(key)
        if val is None:
            return default
        return val.strip().lower() in {"1", "true", "yes", "on", "enable", "enabled"}

    async def get_str(self, key: str, default: str = "") -> str:
        val = await self.get(key)
        return val if val is not None else default

    async def get_float(self, key: str, default: float = 0.0) -> float:
        val = await self.get(key)
        if val is None:
            return default
        try:
            return float(val)
        except ValueError:
            return default
