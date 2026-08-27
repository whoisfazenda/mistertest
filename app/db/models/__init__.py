"""ORM models package — import all models so metadata is fully populated."""
from app.db.models.app_setting import AppSetting
from app.db.models.admin_operations import (
    AdminAuditLog,
    AdminCampaign,
    AdminTask,
    BroadcastTemplate,
    CampaignDelivery,
)
from app.db.models.order import Order
from app.db.models.notification import UserNotification
from app.db.models.plan import VPNPlanSnapshot
from app.db.models.promo import PromoCode, PromoRedemption
from app.db.models.subscription import VPNSubscription
from app.db.models.support_ticket import SupportTicket
from app.db.models.user import User
from app.db.models.webhook_event import WebhookEvent

__all__ = [
    "AppSetting",
    "AdminAuditLog",
    "AdminCampaign",
    "AdminTask",
    "BroadcastTemplate",
    "CampaignDelivery",
    "Order",
    "SupportTicket",
    "PromoCode",
    "PromoRedemption",
    "User",
    "UserNotification",
    "VPNPlanSnapshot",
    "VPNSubscription",
    "WebhookEvent",
]
