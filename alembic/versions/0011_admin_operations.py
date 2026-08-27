"""add admin operations and role data

Revision ID: 0011
Revises: 0010
Create Date: 2026-08-14 21:30:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("admin_note", sa.Text(), nullable=True))
    op.add_column(
        "users",
        sa.Column("admin_tags", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "promo_codes",
        sa.Column("audience", sa.String(32), nullable=False, server_default="all"),
    )
    op.add_column(
        "promo_codes",
        sa.Column("per_user_limit", sa.Integer(), nullable=False, server_default="1"),
    )
    with op.batch_alter_table("promo_redemptions") as batch:
        batch.drop_constraint("uq_promo_redemption_user", type_="unique")
        batch.create_index(
            "ix_promo_redemptions_promo_user",
            ["promo_code_id", "user_id"],
            unique=False,
        )

    op.create_table(
        "admin_audit_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("admin_user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("target_type", sa.String(40), nullable=False),
        sa.Column("target_id", sa.String(128), nullable=False),
        sa.Column("summary", sa.String(240), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["admin_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("admin_user_id", "action", "target_type", "target_id"):
        op.create_index(f"ix_admin_audit_logs_{column}", "admin_audit_logs", [column])

    op.create_table(
        "admin_tasks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("task_uuid", sa.String(36), nullable=False),
        sa.Column("task_type", sa.String(40), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("priority", sa.String(16), nullable=False, server_default="normal"),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("target_type", sa.String(40), nullable=False),
        sa.Column("target_id", sa.String(128), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("resolved_by_user_id", sa.Integer(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["resolved_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_tasks_task_uuid", "admin_tasks", ["task_uuid"], unique=True)
    op.create_index("ix_admin_tasks_task_type", "admin_tasks", ["task_type"])
    op.create_index("ix_admin_tasks_status", "admin_tasks", ["status"])
    op.create_index("ix_admin_tasks_priority", "admin_tasks", ["priority"])

    op.create_table(
        "admin_campaigns",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("campaign_uuid", sa.String(36), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("audience", sa.String(32), nullable=False, server_default="all"),
        sa.Column("trigger_type", sa.String(40), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("image_url", sa.String(1000), nullable=True),
        sa.Column("button_text", sa.String(64), nullable=True),
        sa.Column("button_url", sa.String(1000), nullable=True),
        sa.Column("schedule_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_campaigns_campaign_uuid", "admin_campaigns", ["campaign_uuid"], unique=True)
    op.create_index("ix_admin_campaigns_kind", "admin_campaigns", ["kind"])
    op.create_index("ix_admin_campaigns_status", "admin_campaigns", ["status"])
    op.create_index("ix_admin_campaigns_schedule_at", "admin_campaigns", ["schedule_at"])

    op.create_table(
        "campaign_deliveries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("campaign_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="sent"),
        sa.Column("error_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["campaign_id"], ["admin_campaigns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("campaign_id", "user_id", name="uq_campaign_delivery_user"),
    )
    op.create_index("ix_campaign_deliveries_campaign_id", "campaign_deliveries", ["campaign_id"])
    op.create_index("ix_campaign_deliveries_user_id", "campaign_deliveries", ["user_id"])

    op.create_table(
        "broadcast_templates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("image_url", sa.String(1000), nullable=True),
        sa.Column("button_text", sa.String(64), nullable=True),
        sa.Column("button_url", sa.String(1000), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_broadcast_templates_name", "broadcast_templates", ["name"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_broadcast_templates_name", table_name="broadcast_templates")
    op.drop_table("broadcast_templates")
    op.drop_index("ix_campaign_deliveries_user_id", table_name="campaign_deliveries")
    op.drop_index("ix_campaign_deliveries_campaign_id", table_name="campaign_deliveries")
    op.drop_table("campaign_deliveries")
    op.drop_index("ix_admin_campaigns_schedule_at", table_name="admin_campaigns")
    op.drop_index("ix_admin_campaigns_status", table_name="admin_campaigns")
    op.drop_index("ix_admin_campaigns_kind", table_name="admin_campaigns")
    op.drop_index("ix_admin_campaigns_campaign_uuid", table_name="admin_campaigns")
    op.drop_table("admin_campaigns")
    op.drop_index("ix_admin_tasks_priority", table_name="admin_tasks")
    op.drop_index("ix_admin_tasks_status", table_name="admin_tasks")
    op.drop_index("ix_admin_tasks_task_type", table_name="admin_tasks")
    op.drop_index("ix_admin_tasks_task_uuid", table_name="admin_tasks")
    op.drop_table("admin_tasks")
    for column in ("target_id", "target_type", "action", "admin_user_id"):
        op.drop_index(f"ix_admin_audit_logs_{column}", table_name="admin_audit_logs")
    op.drop_table("admin_audit_logs")
    with op.batch_alter_table("promo_redemptions") as batch:
        batch.drop_index("ix_promo_redemptions_promo_user")
        batch.create_unique_constraint(
            "uq_promo_redemption_user", ["promo_code_id", "user_id"]
        )
    op.drop_column("promo_codes", "per_user_limit")
    op.drop_column("promo_codes", "audience")
    op.drop_column("users", "admin_tags")
    op.drop_column("users", "admin_note")
