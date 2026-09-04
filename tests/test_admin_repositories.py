"""Administrative filtering and pagination repository tests."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.core.enums import OrderStatus, OrderType
from app.db.models.order import Order
from app.db.models.subscription import VPNSubscription
from app.db.models.user import User
from app.repositories.orders import OrderRepository
from app.repositories.users import UserRepository


@pytest.mark.asyncio
async def test_admin_user_segment_filters_before_limit(session) -> None:
    now = datetime.now(timezone.utc)
    users = [
        User(telegram_id=1000 + index, username=f"user{index}")
        for index in range(4)
    ]
    session.add_all(users)
    await session.flush()
    session.add(
        VPNSubscription(
            subscription_uuid="active-sub",
            user_id=users[-1].id,
            plan_name="Active",
            expires_at=now + timedelta(days=30),
            is_active=True,
            is_frozen=False,
        )
    )
    await session.commit()

    result = await UserRepository(session).list_admin(segment="active", limit=1)

    assert [user.id for user in result] == [users[-1].id]
    assert await UserRepository(session).count_admin(segment="active") == 1


@pytest.mark.asyncio
async def test_admin_expiring_and_blocked_segments(session) -> None:
    now = datetime.now(timezone.utc)
    expiring = User(telegram_id=2001, username="expiring")
    blocked = User(telegram_id=2002, username="blocked", is_blocked=True)
    session.add_all([expiring, blocked])
    await session.flush()
    session.add(
        VPNSubscription(
            subscription_uuid="expiring-sub",
            user_id=expiring.id,
            plan_name="Soon",
            expires_at=now + timedelta(days=3),
            is_active=True,
            is_frozen=False,
        )
    )
    await session.commit()

    repo = UserRepository(session)

    assert [user.id for user in await repo.list_admin(segment="expiring")] == [expiring.id]
    assert [user.id for user in await repo.list_admin(segment="blocked")] == [blocked.id]


@pytest.mark.asyncio
async def test_admin_order_filter_paginates_with_total(session) -> None:
    user = User(telegram_id=3001)
    session.add(user)
    await session.flush()
    statuses = [OrderStatus.FAILED, OrderStatus.COMPLETED, OrderStatus.FAILED]
    for index, status in enumerate(statuses):
        session.add(
            Order(
                order_uuid=f"order-{index}",
                user_id=user.id,
                order_type=OrderType.NEW_SUBSCRIPTION,
                snapshot={},
                amount=Decimal("100"),
                currency="RUB",
                payment_provider="mock",
                status=status,
                idempotency_key=f"idem-{index}",
            )
        )
    await session.commit()

    repo = OrderRepository(session)
    first_page = await repo.list_filtered(status=OrderStatus.FAILED, limit=1, offset=0)
    second_page = await repo.list_filtered(status=OrderStatus.FAILED, limit=1, offset=1)

    assert len(first_page) == 1
    assert len(second_page) == 1
    assert first_page[0].id != second_page[0].id
    assert await repo.count_filtered(status=OrderStatus.FAILED) == 2
