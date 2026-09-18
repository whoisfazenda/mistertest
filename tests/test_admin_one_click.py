"""Tests for admin 1-click connection features in Telegram bot and web proxy."""
from __future__ import annotations

import pytest

from app.bot import texts
from app.bot.keyboards.menus import subscription_link_keyboard
from app.api.routes.subscription_page import admin_one_click_redirect


def test_subscription_links_text_admin_vs_regular() -> None:
    ru = "https://sub.misterv.site/ru123"
    sub = "https://sub.misterv.site/sub123"

    reg_text = texts.subscription_links_text(ru, sub, is_admin=False)
    assert "mistervpn://admin" not in reg_text
    assert "Только для админов" not in reg_text

    admin_text = texts.subscription_links_text(ru, sub, is_admin=True)
    assert "mistervpn://admin?url=" in admin_text
    assert "Только для админов" in admin_text


def test_subscription_link_keyboard_admin_controls() -> None:
    ru = "https://sub.misterv.site/ru123"
    sub = "https://sub.misterv.site/sub123"

    reg_kb = subscription_link_keyboard(ru, sub_url=sub, is_admin=False)
    reg_texts = [b.text for row in reg_kb.inline_keyboard for b in row]
    assert not any("1-клик" in t for t in reg_texts)

    admin_kb = subscription_link_keyboard(
        ru,
        sub_url=sub,
        is_admin=True,
        redirect_url="https://sub.misterv.site/connect/admin?url=" + ru,
    )
    admin_texts = [b.text for row in admin_kb.inline_keyboard for b in row]
    assert any("Подключить в 1 клик" in t for t in admin_texts)
    assert any("1-клик ключ" in t for t in admin_texts)


@pytest.mark.asyncio
async def test_admin_one_click_redirect_endpoint() -> None:
    target_url = "https://sub.misterv.site/ru123"
    resp = await admin_one_click_redirect(url=target_url)
    assert resp.status_code == 200
    html = resp.body.decode("utf-8")
    assert "mistervpn://admin?url=https://sub.misterv.site/ru123" in html
    assert "Запуск приложения и подключение в 1 клик" in html


def test_subscription_app_key_and_keyboard() -> None:
    from app.services.subscriptions import subscription_app_key

    uuid = "6fb54f15-7798-46cb-84aa-fa2256df25ea"
    user_key = subscription_app_key(uuid, is_admin=False)
    assert user_key == f"MR-{uuid}"

    admin_key = subscription_app_key(uuid, is_admin=True)
    assert admin_key == f"MR-ADMIN-{uuid}"

    # Verify key is present in subscription_links_text
    ru = "https://ru.misterv.site/" + uuid
    sub = "https://sub.misterv.site/" + uuid
    txt = texts.subscription_links_text(ru, sub, subscription_uuid=uuid, is_admin=False)
    assert f"<code>MR-{uuid}</code>" in txt
    assert "Ключ для приложения Mister VPN" in txt

    # Verify copy button in keyboard
    kb = subscription_link_keyboard(ru, sub_url=sub, subscription_uuid=uuid, is_admin=False)
    buttons = [b for row in kb.inline_keyboard for b in row]
    copy_keys = [b for b in buttons if b.copy_text and b.copy_text.text == f"MR-{uuid}"]
    assert len(copy_keys) == 1
    assert "Скопировать ключ в приложение" in copy_keys[0].text
