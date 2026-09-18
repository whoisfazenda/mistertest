"""Menu and screen keyboards."""
from __future__ import annotations

from urllib.parse import quote

from aiogram.types import InlineKeyboardMarkup

from app.bot.keyboards.factory import (
    inline_keyboard,
    make_button,
    make_copy_button,
    make_url_button,
)
from app.core.config import settings
from app.db.models.subscription import VPNSubscription
from aiogram.types import InlineKeyboardButton

SUPPORT_URL = "https://t.me/mistervpnsup_bot"


def main_menu(*, is_admin: bool = False, show_trial: bool = False) -> InlineKeyboardMarkup:
    rows = [
        [("🛒 Купить VPN", "buy:list", "success"), ("👤 Профиль", "profile:open", "primary")],
    ]
    if show_trial:
        rows.append([("💎 Пробный период 7 дней", "trial:claim", "primary")])
    rows.append([("💡 Помощь", "help:open")])
    if is_admin:
        rows.append([("🛠 Админ-панель", "admin:menu", "danger")])
    return inline_keyboard(rows)


def back_to_menu(label: str = "⬅️ В меню") -> InlineKeyboardMarkup:
    return inline_keyboard([[(label, "menu:open")]])


def referral_keyboard(link: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [make_url_button("👥 Пригласить друга", link)],
            [make_copy_button("📋 Скопировать ссылку", link)],
            [make_button("⬅️ В меню", "menu:open")],
        ]
    )


def support_keyboard() -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    rows.append([make_url_button("💬 Написать в поддержку", "https://t.me/mistervpnsup_bot")])
    rows.append([make_button("⬅️ В меню", "menu:open")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def help_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [make_url_button("📢 Новостной канал", "https://t.me/mistervpn_news")],
            [make_url_button("💬 Поддержка", "https://t.me/mistervpnsup_bot")],
            [make_button("📲 Инструкция по подключению", "help:connect", "primary")],
            [make_button("⬅️ В меню", "menu:open")],
        ]
    )


def connect_guide_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                make_url_button(
                    "💻 Windows / macOS",
                    "https://telegra.ph/Kak-podklyuchit-Mister-VPN-na-WindowsMacOS-07-01",
                )
            ],
            [
                make_url_button(
                    "📱 Android / iOS",
                    "https://telegra.ph/Kak-podklyuchit-Mister-VPN-na-AndroidIOS-07-01",
                )
            ],
            [make_button("⬅️ Назад", "help:open")],
        ]
    )


def my_vpn_keyboard(sub: VPNSubscription, is_admin: bool = False) -> InlineKeyboardMarkup:
    rows: list[list] = []
    rows.append([make_button("🔗 Получить ссылку", "myvpn:link", "primary")])
    if sub.is_trial:
        rows.append([make_button("🛒 Купить основной тариф", "buy:list", "success")])
    else:
        rows.append(
            [
                make_button("♻️ Продлить", "renew:menu", "success"),
                make_button("🚀 Улучшить тариф", "upgrade:menu", "primary"),
            ]
        )
    rows.append([make_button("📱 Мои устройства", "devices:list")])
    if is_admin:
        rows.append([make_button("👨‍👩‍👧‍👦 Семейный доступ", "family:menu", "primary")])
    # Traffic top-up only for limited plans.
    if not sub.is_unlimited_traffic:
        rows.append([make_button("⚡ Докупить трафик", "traffic:menu", "primary")])
    if sub.is_frozen:
        rows.append([make_button("▶️ Разморозить", "freeze:unfreeze", "primary")])
    else:
        rows.append([make_button("⏸ Заморозить", "freeze:confirm", "danger")])
    rows.append([make_button("⬅️ Назад", "menu:open")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def subscription_link_keyboard(
    ru_url: str,
    backup_url: str | None = None,
    sub_url: str | None = None,
    *,
    is_admin: bool = False,
    redirect_url: str | None = None,
    subscription_uuid: str | None = None,
) -> InlineKeyboardMarkup:
    rows: list[list] = []

    if subscription_uuid:
        from app.services.subscriptions import subscription_app_key

        app_key = subscription_app_key(subscription_uuid, is_admin=is_admin)
        rows.append([
            make_copy_button("🔑 Скопировать ключ в приложение", app_key),
        ])

    if is_admin:
        admin_deep_link = f"mistervpn://admin?url={quote(ru_url, safe='')}"
        admin_row = []
        if redirect_url:
            admin_row.append(make_url_button("🚀 Подключить в 1 клик", redirect_url))
        admin_row.append(make_copy_button("👑 Скопировать 1-клик ключ", admin_deep_link))
        rows.append(admin_row)

    rows.append([
        make_url_button("🇷🇺 Открыть (РФ)", ru_url),
        make_copy_button("📋 Скопировать (РФ)", ru_url),
    ])
    if sub_url and sub_url != ru_url:
        rows.append(
            [
                make_url_button("🌍 Открыть (вне РФ)", sub_url),
                make_copy_button("📋 Скопировать (вне РФ)", sub_url),
            ]
        )
    if backup_url and backup_url not in (ru_url, sub_url):
        rows.append(
            [
                make_url_button("⚡ Резервная (network)", backup_url),
                make_copy_button("📋 Резервная (network)", backup_url),
            ]
        )
    rows.extend(
        [
            [make_button("📲 Инструкция по подключению", "help:connect")],
            [make_button("⬅️ Назад", "myvpn:open")],
        ]
    )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def no_subscription_keyboard() -> InlineKeyboardMarkup:
    return inline_keyboard(
        [
            [("🛒 Купить VPN", "buy:list", "success")],
            [("⬅️ В меню", "menu:open")],
        ]
    )
