"""Admin filter — restricts handlers to configured ADMIN_IDS."""
from __future__ import annotations

from aiogram.filters import BaseFilter
from aiogram.types import CallbackQuery, Message

from app.core.config import settings
from app.db.models.user import User
from app.services.admin_operations import is_admin_role


class IsAdmin(BaseFilter):
    async def __call__(self, event: Message | CallbackQuery, user: User | None = None) -> bool:
        tg_user = event.from_user
        if tg_user is None:
            return False
        if settings.is_admin(tg_user.id):
            return True
        return is_admin_role(user) if isinstance(user, User) else False
