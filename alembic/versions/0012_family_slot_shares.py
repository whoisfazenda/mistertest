"""add family slot shares table

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-02 21:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "family_slot_shares",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subscription_id", sa.Integer(), sa.ForeignKey("vpn_subscriptions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(128), nullable=False, server_default="Семейный слот"),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("claimed_by_telegram_id", sa.BigInteger(), nullable=True),
        sa.Column("claimed_by_username", sa.String(128), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("bound_device_id", sa.String(64), nullable=True),
        sa.Column("bound_device_name", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_family_slot_shares_token", "family_slot_shares", ["token"], unique=True)
    op.create_index("ix_family_slot_shares_owner", "family_slot_shares", ["owner_user_id"], unique=False)
    op.create_index("ix_family_slot_shares_sub", "family_slot_shares", ["subscription_id"], unique=False)
    op.create_index("ix_family_slot_shares_status", "family_slot_shares", ["status"], unique=False)


def downgrade() -> None:
    op.drop_table("family_slot_shares")
