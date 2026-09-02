"""FamilySlotShare model — allows subscription owners to share device slots."""
from __future__ import annotations

from datetime import datetime
import secrets

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base
from app.db.models.mixins import TimestampMixin


def generate_share_token() -> str:
    """Generate a secure, URL-safe 24-character token."""
    return secrets.token_urlsafe(18)


class FamilySlotShare(Base, TimestampMixin):
    __tablename__ = "family_slot_shares"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    token: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, default=generate_share_token, nullable=False
    )
    owner_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    subscription_id: Mapped[int] = mapped_column(
        ForeignKey("vpn_subscriptions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    label: Mapped[str] = mapped_column(String(128), default="Семейный слот", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", index=True, nullable=False)

    claimed_by_telegram_id: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True, index=True
    )
    claimed_by_username: Mapped[str | None] = mapped_column(String(128), nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    bound_device_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bound_device_name: Mapped[str | None] = mapped_column(String(128), nullable=True)

    owner = relationship("User", foreign_keys=[owner_user_id], lazy="selectin")
    subscription = relationship(
        "VPNSubscription", foreign_keys=[subscription_id], lazy="selectin"
    )

    @property
    def is_active(self) -> bool:
        return self.status == "active"
