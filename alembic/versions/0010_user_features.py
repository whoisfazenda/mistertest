"""add Mini App user features

Revision ID: 0010
Revises: 0009
Create Date: 2026-08-14 18:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table)}


def _index_names(table: str) -> set[str]:
    return {index["name"] for index in inspect(op.get_bind()).get_indexes(table) if index.get("name")}


def _fk_names(table: str) -> set[str]:
    return {fk.get("name") for fk in inspect(op.get_bind()).get_foreign_keys(table) if fk.get("name")}


def upgrade() -> None:
    columns = _column_names("users")
    if "referrer_id" not in columns:
        op.add_column("users", sa.Column("referrer_id", sa.Integer(), nullable=True))
    if "referral_rewarded" not in columns:
        op.add_column(
            "users",
            sa.Column("referral_rewarded", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    if "referral_earned" not in columns:
        op.add_column(
            "users",
            sa.Column("referral_earned", sa.Numeric(12, 2), nullable=False, server_default="0"),
        )
    if "preferred_payment_method" not in columns:
        op.add_column(
            "users",
            sa.Column("preferred_payment_method", sa.String(32), nullable=False, server_default="card"),
        )

    if "fk_users_referrer_id_users" not in _fk_names("users"):
        with op.batch_alter_table("users") as batch:
            batch.create_foreign_key(
                "fk_users_referrer_id_users",
                "users",
                ["referrer_id"],
                ["id"],
                ondelete="SET NULL",
            )
    if "ix_users_referrer_id" not in _index_names("users"):
        op.create_index("ix_users_referrer_id", "users", ["referrer_id"])

    tables = set(inspect(op.get_bind()).get_table_names())
    if "user_notifications" not in tables:
        op.create_table(
            "user_notifications",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("event_key", sa.String(160), nullable=False),
            sa.Column("kind", sa.String(32), nullable=False, server_default="info"),
            sa.Column("title", sa.String(160), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "event_key", name="uq_user_notifications_event"),
        )
        op.create_index("ix_user_notifications_user_id", "user_notifications", ["user_id"])

    if "support_tickets" not in tables:
        op.create_table(
            "support_tickets",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("ticket_uuid", sa.String(36), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("category", sa.String(32), nullable=False, server_default="other"),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="open"),
            sa.Column("admin_reply", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_support_tickets_ticket_uuid", "support_tickets", ["ticket_uuid"], unique=True)
        op.create_index("ix_support_tickets_user_id", "support_tickets", ["user_id"])
        op.create_index("ix_support_tickets_status", "support_tickets", ["status"])


def downgrade() -> None:
    op.drop_index("ix_support_tickets_status", table_name="support_tickets")
    op.drop_index("ix_support_tickets_user_id", table_name="support_tickets")
    op.drop_index("ix_support_tickets_ticket_uuid", table_name="support_tickets")
    op.drop_table("support_tickets")
    op.drop_index("ix_user_notifications_user_id", table_name="user_notifications")
    op.drop_table("user_notifications")
    op.drop_index("ix_users_referrer_id", table_name="users")
    op.drop_constraint("fk_users_referrer_id_users", "users", type_="foreignkey")
    op.drop_column("users", "preferred_payment_method")
    op.drop_column("users", "referral_earned")
    op.drop_column("users", "referral_rewarded")
    op.drop_column("users", "referrer_id")
