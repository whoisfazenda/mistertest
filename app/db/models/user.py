"""User model."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import UserRole
from app.db.database import Base
from app.db.models.mixins import TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    telegram_id: Mapped[int] = mapped_column(
        BigInteger, unique=True, index=True, nullable=False
    )
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    language: Mapped[str] = mapped_column(String(8), default="ru", nullable=False)
    role: Mapped[UserRole] = mapped_column(
        String(16), default=UserRole.USER, nullable=False
    )
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    balance: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    balance_currency: Mapped[str] = mapped_column(String(8), default="RUB", nullable=False)
    trial_claimed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    referrer_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    referral_rewarded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    referral_earned: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    preferred_payment_method: Mapped[str] = mapped_column(
        String(32), default="card", nullable=False
    )
    last_activity_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=True
    )
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    @property
    def is_admin(self) -> bool:
        from app.core.config import settings
        if settings.is_admin(self.telegram_id, self.username):
            return True
        return str(self.role).lower() in {"admin", "owner"}

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User id={self.id} tg={self.telegram_id}>"
