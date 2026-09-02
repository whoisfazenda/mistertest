"""Family Share handlers for Telegram Bot (Device Slot Sharing)."""
from __future__ import annotations

import urllib.parse

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot import texts
from app.bot.deps import get_client
from app.bot.handlers._errors import friendly_error
from app.bot.keyboards.factory import inline_keyboard
from app.bot.premium_emoji import pe
from app.bot.screens import replace_with_text_screen
from app.core.config import settings
from app.core.logging import get_logger
from app.db.models.user import User
from app.services.family_share import FamilyShareService
from app.utils.formatting import escape

logger = get_logger(__name__)
router = Router(name="family_share")


class FamilyShareState(StatesGroup):
    waiting_for_label = State()


def _is_admin(user: User) -> bool:
    return user.is_admin


@router.callback_query(F.data == "family:menu")
async def open_family_menu(
    callback: CallbackQuery, session: AsyncSession, user: User, state: FSMContext
) -> None:
    if not _is_admin(user):
        await callback.answer("Семейный доступ пока доступен в закрытом режиме.", show_alert=True)
        return

    await state.clear()
    service = FamilyShareService(session, get_client())
    summary = await service.get_family_slots_summary(user.id)

    if not summary.get("has_subscription"):
        await callback.answer("У вас нет активной подписки.", show_alert=True)
        return

    total = summary["total_slots"]
    used_dev = summary["used_devices"]
    active_shares = summary["active_shares_count"]
    avail = summary["available_slots"]
    plan_name = summary.get("plan_name", "Mister VPN")

    lines = [
        f"{pe('devices')} <b>Семейный доступ (Слоты устройств)</b>",
        "",
        "Делитесь свободными слотами вашего тарифа с близкими людьми. "
        "Каждый приглашённый получает доступ строго на <b>1 устройство</b> без доступа к управлению вашей подпиской.",
        "",
        f"Тариф: <b>{escape(plan_name)}</b>",
        f"Всего слотов в тарифе: <b>{total}</b>",
        f"Ваших активных устройств: <b>{used_dev}</b>",
        f"Роздано семейных слотов: <b>{active_shares}</b>",
        f"Доступно для шеринга: <b>{avail}</b>",
    ]

    rows = []
    shares = summary.get("shares", [])
    active_list = [s for s in shares if s["status"] == "active"]

    if active_list:
        lines.append("")
        lines.append("👥 <b>Активные семейные слоты:</b>")
        for idx, s in enumerate(active_list, start=1):
            lbl = escape(s['label'])
            claimed = f"(@{s['claimed_by_username']})" if s.get("claimed_by_username") else "ожидает подключения"
            lines.append(f"{idx}. <b>{lbl}</b> — {claimed}")
            rows.append([(f"🚫 Отозвать «{lbl[:18]}»", f"family:del:{s['id']}", "danger")])

    lines.append("")
    if avail > 0:
        rows.append([("➕ Поделиться свободным слотом", "family:add", "success")])
    else:
        lines.append("<i>Все слоты заняты. Чтобы добавить ещё людей, отзовите ненужный слот.</i>")

    rows.append([("⬅️ К подпискам", "profile:subs"), ("⬅️ В меню", "menu:open")])

    await replace_with_text_screen(callback, "\n".join(lines), reply_markup=inline_keyboard(rows))
    await callback.answer()


@router.callback_query(F.data == "family:add")
async def start_add_slot(
    callback: CallbackQuery, session: AsyncSession, user: User, state: FSMContext
) -> None:
    if not _is_admin(user):
        await callback.answer()
        return

    service = FamilyShareService(session, get_client())
    summary = await service.get_family_slots_summary(user.id)
    if summary["available_slots"] <= 0:
        await callback.answer("Все доступные слоты уже заняты.", show_alert=True)
        return

    await state.set_state(FamilyShareState.waiting_for_label)

    quick_options = [
        [("👩 Мама", "family:pick:Мама"), ("👨 Папа", "family:pick:Папа")],
        [("❤️ Вторая половинка", "family:pick:Вторая половинка"), ("🤝 Друг", "family:pick:Друг")],
        [("📱 Телефон", "family:pick:Телефон"), ("💻 Ноутбук", "family:pick:Ноутбук")],
        [("⬅️ Отмена", "family:menu")],
    ]

    text = (
        f"{pe('gift')} <b>Кому вы хотите выдать доступ?</b>\n\n"
        "Выберите быстрый вариант или просто отправьте в чат имя (например: <i>«Брат»</i>, <i>«iPad»</i>):"
    )
    await replace_with_text_screen(callback, text, reply_markup=inline_keyboard(quick_options))
    await callback.answer()


@router.callback_query(F.data.startswith("family:pick:"))
async def pick_slot_label(
    callback: CallbackQuery, session: AsyncSession, user: User, state: FSMContext
) -> None:
    label = callback.data.split(":", 2)[2]
    await _create_and_show_invite(callback, session, user, state, label)


@router.message(FamilyShareState.waiting_for_label)
async def custom_slot_label(
    message: Message, session: AsyncSession, user: User, state: FSMContext
) -> None:
    label = (message.text or "").strip()[:40] or "Семейный слот"
    service = FamilyShareService(session, get_client())
    try:
        share = await service.create_slot(user.id, label)
    except Exception as exc:
        await state.clear()
        await message.answer(friendly_error(exc))
        return

    await state.clear()
    bot_user = await message.bot.get_me()
    bot_username = bot_user.username or "misterfvpn_bot"
    invite_url = f"https://t.me/{bot_username}?start=fshare_{share.token}"

    share_text = urllib.parse.quote(
        f"Привет! Я делюсь с тобой быстрым Mister VPN на 1 устройство.\n"
        f"Нажми на ссылку ниже, чтобы подключиться за 1 минуту:\n{invite_url}"
    )
    tg_share_link = f"https://t.me/share/url?url={invite_url}&text={share_text}"

    text = (
        f"🎉 <b>Слот «{escape(share.label)}» успешно создан!</b>\n\n"
        "Отправьте эту ссылку тому, с кем хотите поделиться:\n"
        f"<code>{invite_url}</code>\n\n"
        "<i>Ссылка рассчитана на 1 устройство. Вы в любой момент можете отозвать доступ в разделе «Семейный доступ».</i>"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📤 Отправить в Telegram", url=tg_share_link)],
            [InlineKeyboardButton(text="⬅️ В Семейный доступ", callback_data="family:menu")],
        ]
    )
    await message.answer(text, reply_markup=kb)


async def _create_and_show_invite(
    callback: CallbackQuery,
    session: AsyncSession,
    user: User,
    state: FSMContext,
    label: str,
) -> None:
    await state.clear()
    service = FamilyShareService(session, get_client())
    try:
        share = await service.create_slot(user.id, label)
    except Exception as exc:
        await callback.answer(friendly_error(exc), show_alert=True)
        return

    bot_user = await callback.bot.get_me()
    bot_username = bot_user.username or "misterfvpn_bot"
    invite_url = f"https://t.me/{bot_username}?start=fshare_{share.token}"

    share_text = urllib.parse.quote(
        f"Привет! Я делюсь с тобой быстрым Mister VPN на 1 устройство.\n"
        f"Нажми на ссылку ниже, чтобы подключиться за 1 минуту:\n{invite_url}"
    )
    tg_share_link = f"https://t.me/share/url?url={invite_url}&text={share_text}"

    text = (
        f"🎉 <b>Слот «{escape(share.label)}» успешно создан!</b>\n\n"
        "Отправьте эту ссылку тому, с кем хотите поделиться:\n"
        f"<code>{invite_url}</code>\n\n"
        "<i>Ссылка рассчитана строго на 1 устройство. Вы в любой момент сможете отозвать доступ в разделе «Семейный доступ».</i>"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📤 Отправить в Telegram", url=tg_share_link)],
            [InlineKeyboardButton(text="⬅️ В Семейный доступ", callback_data="family:menu")],
        ]
    )
    await replace_with_text_screen(callback, text, reply_markup=kb)
    await callback.answer()


@router.callback_query(F.data.startswith("family:del:"))
async def confirm_revoke_slot(
    callback: CallbackQuery, session: AsyncSession, user: User
) -> None:
    share_id = int(callback.data.split(":", 2)[2])
    service = FamilyShareService(session, get_client())
    summary = await service.get_family_slots_summary(user.id)
    target = next((s for s in summary.get("shares", []) if s["id"] == share_id), None)

    if not target:
        await callback.answer("Слот не найден или уже отозван.", show_alert=True)
        return

    lbl = escape(target["label"])
    text = (
        f"🚫 <b>Отозвать слот «{lbl}»?</b>\n\n"
        "Устройство потеряет доступ к VPN, а слот вернётся к вам и станет доступен для повторного использования."
    )
    rows = [
        [("✅ Да, отозвать", f"family:delok:{share_id}", "danger")],
        [("⬅️ Отмена", "family:menu")],
    ]
    await replace_with_text_screen(callback, text, reply_markup=inline_keyboard(rows))
    await callback.answer()


@router.callback_query(F.data.startswith("family:delok:"))
async def do_revoke_slot(
    callback: CallbackQuery, session: AsyncSession, user: User, state: FSMContext
) -> None:
    share_id = int(callback.data.split(":", 2)[2])
    service = FamilyShareService(session, get_client())
    try:
        await service.revoke_slot(user.id, share_id)
        await callback.answer("✅ Слот успешно отозван", show_alert=True)
    except Exception as exc:
        await callback.answer(friendly_error(exc), show_alert=True)

    # Return to menu
    await open_family_menu(callback, session, user, state)
