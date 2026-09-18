"""Public subscription management website and VPN node proxy.

Provides:
- Direct clean URLs on the bot's domain (e.g. https://sub.misterv.site/{uuid})
- Self-hosted web page for user subscription management (1-click app launch, QR code, devices, speed tests).
- High-performance transparent proxy for VPN client apps (Happ, Incy, V2RayTun, Karing, Sing-Box, Shadowrocket).
"""
from __future__ import annotations

import html
import json
import os
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from app.clients.adaptgroup import _first
from app.db.database import async_session_factory
from app.db.models.subscription import VPNSubscription
from app.repositories.subscriptions import SubscriptionRepository
from app.services.family_share import FamilyShareService
from app.services.subscriptions import (
    SubscriptionService,
    public_subscription_url,
    upstream_subscription_url,
)
from app.utils.formatting import format_date, format_gb_used

router = APIRouter()

RESERVED_ROOT_PATHS = {
    "health",
    "webhook",
    "miniapp",
    "docs",
    "redoc",
    "openapi.json",
    "favicon.ico",
    "api",
    "static",
    "assets",
    "s",
    "sub",
    "subscription",
    "share",
}

_PASSTHROUGH_HEADERS = (
    "content-type",
    "content-disposition",
    "subscription-userinfo",
    "profile-title",
    "profile-update-interval",
    "support-url",
    "profile-web-page-url",
    "etag",
    "last-modified",
)

_FORWARDED_STANDARD_REQUEST_HEADERS = {
    "accept",
    "accept-language",
    "cache-control",
    "if-modified-since",
    "if-none-match",
    "user-agent",
}

_BLOCKED_REQUEST_HEADERS = {
    "authorization",
    "connection",
    "content-length",
    "cookie",
    "host",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "x-api-key",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-port",
    "x-forwarded-proto",
    "x-real-ip",
}


def _e(val: Any) -> str:
    return html.escape(str(val) if val is not None else "")


def _is_browser_request(request: Request) -> bool:
    if request.query_params.get("web") == "1":
        return True
    if request.query_params.get("raw") == "1":
        return False

    ua = request.headers.get("user-agent", "").lower()
    accept = request.headers.get("accept", "").lower()

    vpn_clients = (
        "happ", "incy", "v2ray", "sing-box", "clash", "karing",
        "streisand", "shadowrocket", "v2box", "nekobox", "sagernet",
        "wireguard", "amnezia", "outline", "foxray", "loon", "surge",
        "quantumult", "stash", "hiddify", "flclash", "curl", "wget",
        "okhttp", "cfnetwork", "go-http-client", "dart", "python",
        "vless", "trojan", "ss", "v2raytun",
    )
    if any(vc in ua for vc in vpn_clients):
        return False

    sec_dest = request.headers.get("sec-fetch-dest", "").lower()
    sec_mode = request.headers.get("sec-fetch-mode", "").lower()
    if sec_dest == "document" and sec_mode == "navigate":
        return True

    is_standard_browser = ("mozilla" in ua or "safari" in ua or "chrome" in ua) and "text/html" in accept
    if is_standard_browser:
        return True

    return False


@router.get("/s/{subscription_uuid}", response_class=HTMLResponse)
@router.get("/subscription/{subscription_uuid}", response_class=HTMLResponse)
async def subscription_page(
    request: Request,
    subscription_uuid: str,
    *,
    shared_token: str | None = None,
    slot_label: str | None = None,
) -> HTMLResponse:
    deleted = request.query_params.get("deleted") == "1"
    error = request.query_params.get("error") or ""
    
    # Calculate domain base URL
    host = request.headers.get("host") or ""
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
    base_url = f"{scheme}://{host}" if host else ""
    
    async with async_session_factory() as session:
        service = SubscriptionService(session, request.app.state.adaptgroup_client)
        sub = await SubscriptionRepository(session).get_by_uuid(subscription_uuid)
        if sub is None:
            sub = VPNSubscription(subscription_uuid=subscription_uuid, user_id=0)
        try:
            status = await request.app.state.adaptgroup_client.get_status(subscription_uuid)
            service.apply_status_payload(sub, status)
            if sub.id:
                await session.commit()
        except Exception:  # noqa: BLE001
            pass
        try:
            devices = await service.get_devices(sub)
        except Exception:  # noqa: BLE001
            devices = []
            if not error:
                error = "Не удалось загрузить устройства. Попробуйте позже."

    return HTMLResponse(
        _render_page(
            sub,
            devices,
            deleted=deleted,
            error=error,
            base_url=base_url,
            shared_token=shared_token,
            slot_label=slot_label,
        )
    )


@router.post("/s/{subscription_uuid}/devices/{device_id}/delete")
@router.post("/{subscription_uuid}/devices/{device_id}/delete")
async def delete_subscription_device(
    request: Request,
    subscription_uuid: str,
    device_id: str,
) -> RedirectResponse:
    async with async_session_factory() as session:
        service = SubscriptionService(session, request.app.state.adaptgroup_client)
        sub = await SubscriptionRepository(session).get_by_uuid(subscription_uuid)
        if sub is None:
            sub = VPNSubscription(subscription_uuid=subscription_uuid, user_id=0)
        try:
            await service.delete_device(sub, str(device_id))
        except Exception:  # noqa: BLE001
            url = f"/{quote(subscription_uuid)}?error={quote('Не удалось удалить устройство')}"
            return RedirectResponse(url, status_code=303)
    return RedirectResponse(f"/{quote(subscription_uuid)}?deleted=1", status_code=303)


@router.get("/sub/{subscription_uuid}")
async def proxy_subscription(request: Request, subscription_uuid: str) -> Response:
    """Serve AdaptGroup subscription content or render the website if opened in a browser."""
    if _is_browser_request(request):
        return await subscription_page(request, subscription_uuid)

    async with async_session_factory() as session:
        sub = await SubscriptionRepository(session).get_by_uuid(subscription_uuid)
        direct_url = upstream_subscription_url(
            subscription_uuid,
            sub.subscription_url if sub is not None else None,
        )

    request_headers = _upstream_request_headers(request.headers)
    upstream_url = _merge_query_params(
        direct_url,
        request.query_params.multi_items(),
    )
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(25.0, connect=7.0),
            follow_redirects=True,
        ) as client:
            upstream = await client.get(upstream_url, headers=request_headers)
        if upstream.status_code < 400:
            response_headers = {
                name: upstream.headers[name]
                for name in _PASSTHROUGH_HEADERS
                if name in upstream.headers
            }
            response_headers["Cache-Control"] = "private, no-store"
            return Response(
                content=upstream.content,
                status_code=upstream.status_code,
                headers=response_headers,
            )
    except Exception:
        pass

    # Fallback to direct fetch
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            upstream = await client.get(direct_url)
            if upstream.status_code < 400:
                return Response(
                    content=upstream.content,
                    status_code=upstream.status_code,
                    headers={"Content-Type": upstream.headers.get("content-type", "text/plain; charset=utf-8")},
                )
    except Exception:
        pass

    raise HTTPException(status_code=502, detail="Не удалось загрузить конфигурацию подписки. Попробуйте позже.")


@router.get("/share/{token}")
@router.get("/sub/share/{token}")
async def shared_slot_route(request: Request, token: str) -> Response:
    """Serve configuration or web landing page for a shared family slot."""
    is_browser = _is_browser_request(request)

    async with async_session_factory() as session:
        service = FamilyShareService(session, request.app.state.adaptgroup_client)
        share = await service.shares_repo.get_by_token(token)
        if share is None:
            if is_browser:
                return HTMLResponse(
                    _render_slot_error_page(
                        title="Слот не найден",
                        badge="Недействительная ссылка",
                        subtitle="Семейная ссылка не найдена",
                        description="Ссылка на этот семейный слот не существует либо была удалена. Проверьте правильность ссылки или обратитесь к владельцу подписки.",
                        icon="🔍",
                    ),
                    status_code=404,
                )
            raise HTTPException(
                status_code=404,
                detail="Семейный слот не найден или ссылка недействительна",
            )

        slot_label = share.label

        if share.status == "revoked":
            if is_browser:
                return HTMLResponse(
                    _render_slot_error_page(
                        title="Доступ отозван",
                        badge="Слот отозван",
                        subtitle="Владелец отозвал данный слот",
                        description="Владелец подписки отключил этот семейный слот. Подключение к VPN для данного устройства прекращено. Обратитесь к владельцу для получения новой ссылки.",
                        icon="🚫",
                        slot_label=slot_label,
                    ),
                    status_code=404,
                )
            raise HTTPException(
                status_code=404,
                detail="Семейный слот был отозван владельцем",
            )

        if share.status != "active":
            if is_browser:
                return HTMLResponse(
                    _render_slot_error_page(
                        title="Слот неактивен",
                        badge="Слот неактивен",
                        subtitle="Доступ к слоту приостановлен",
                        description="Этот семейный слот в данный момент неактивен. Обратитесь к владельцу подписки.",
                        icon="⏸",
                        slot_label=slot_label,
                    ),
                    status_code=404,
                )
            raise HTTPException(
                status_code=404,
                detail="Семейный слот неактивен",
            )

        sub = share.subscription
        if sub is None or not sub.is_effectively_active:
            if is_browser:
                return HTMLResponse(
                    _render_slot_error_page(
                        title="Подписка истекла",
                        badge="Срок действия истёк",
                        subtitle="Срок действия подписки истёк",
                        description="Срок действия основной подписки подошёл к концу. Для возобновления работы обратитесь к владельцу или подключите собственный VPN в боте.",
                        icon="⌛️",
                        slot_label=slot_label,
                    ),
                    status_code=404,
                )
            raise HTTPException(
                status_code=404,
                detail="Срок действия подписки истёк",
            )

        subscription_uuid = sub.subscription_uuid

    if is_browser:
        return await subscription_page(
            request,
            subscription_uuid,
            shared_token=token,
            slot_label=slot_label,
        )

    return await proxy_subscription(request, subscription_uuid)


@router.get("/{subscription_uuid}")
async def direct_subscription_route(request: Request, subscription_uuid: str) -> Response:
    """Handle direct clean URLs like https://sub.misterv.site/{uuid}."""
    if subscription_uuid in RESERVED_ROOT_PATHS or len(subscription_uuid) < 8:
        if _is_browser_request(request):
            return HTMLResponse(
                _render_slot_error_page(
                    title="Страница не найдена",
                    badge="404 Не найдено",
                    subtitle="Запрошенная страница не существует",
                    description="Проверьте правильность введённого адреса подписки или перейдите в бота.",
                    icon="🔍",
                ),
                status_code=404,
            )
        raise HTTPException(status_code=404, detail="Not Found")
    if _is_browser_request(request):
        return await subscription_page(request, subscription_uuid)
    return await proxy_subscription(request, subscription_uuid)


def _upstream_request_headers(headers: Mapping[str, str]) -> dict[str, str]:
    forwarded: dict[str, str] = {}
    for name, value in headers.items():
        lower_name = name.lower()
        if lower_name in _BLOCKED_REQUEST_HEADERS:
            continue
        if (
            lower_name in _FORWARDED_STANDARD_REQUEST_HEADERS
            or lower_name.startswith("x-")
            or lower_name.startswith("device-")
            or lower_name.startswith("client-")
            or lower_name in {"hwid", "device-id", "client-id"}
        ):
            forwarded[name] = value

    forwarded.setdefault("user-agent", "MisterVPN-Subscription/1.0")
    forwarded.setdefault("accept", "*/*")
    return forwarded


def _merge_query_params(
    direct_url: str,
    query_params: Sequence[tuple[str, str]],
) -> str:
    return str(httpx.URL(direct_url).copy_merge_params(query_params))


def _render_page(
    sub: VPNSubscription,
    devices: list[dict[str, Any]],
    *,
    deleted: bool = False,
    error: str = "",
    base_url: str = "",
    shared_token: str | None = None,
    slot_label: str | None = None,
) -> str:
    if shared_token:
        sub_url = f"{base_url.rstrip('/')}/share/{quote(shared_token, safe='')}"
    else:
        sub_url = public_subscription_url(sub.subscription_uuid)
        if base_url:
            if "sub." in base_url.lower():
                sub_url = f"{base_url.rstrip('/')}/{quote(sub.subscription_uuid, safe='')}"
            else:
                sub_url = f"{base_url.rstrip('/')}/sub/{quote(sub.subscription_uuid, safe='')}"

    status = (
        "Истекла"
        if sub.is_expired
        else "Заморожена"
        if sub.is_frozen
        else "Активна"
        if sub.is_active
        else "Неактивна"
    )
    
    if slot_label:
        plan_name = f"Семейный доступ · {slot_label}"
    elif sub.is_trial:
        plan_name = "Пробный период (3 дня)"
    else:
        plan_name = sub.plan_name or "Mister Unlimited VIP"
        
    expires_str = format_date(sub.expires_at) if sub.expires_at else "Бессрочно"
    
    used_devices = min(1, len(devices)) if shared_token else len(devices)
    max_devices = 1 if shared_token else (sub.max_devices or 5)
    
    traffic_used_gb = "0.0"
    if sub.traffic_used_bytes:
        traffic_used_gb = f"{sub.traffic_used_bytes / (1024**3):.1f}"
        
    traffic_limit_gb = "Безлимит"
    if sub.traffic_limit_bytes and not sub.is_unlimited_traffic:
        traffic_limit_gb = f"{sub.traffic_limit_bytes / (1024**3):.0f} ГБ"

    # Read template from adaptgroup/mister_vpn_subscription_page.html
    template_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
        "adaptgroup",
        "mister_vpn_subscription_page.html",
    )
    
    html_text = ""
    if os.path.exists(template_path):
        with open(template_path, "r", encoding="utf-8") as f:
            html_text = f.read()
    else:
        html_text = f"""<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><title>Mister VPN</title></head>
<body><h1>Mister VPN</h1><p>Подписка: {sub_url}</p></body>
</html>"""

    if shared_token:
        devices_html = '<div style="text-align:center;padding:16px;color:#8e8e9a;font-size:12px;">Слот закреплен строго за вашим устройством</div>'
    else:
        # Device list rendering
        device_rows = []
        for d in devices:
            d_id = d.get("id") or d.get("device_id") or ""
            d_name = d.get("name") or d.get("device_model") or "Устройство"
            d_ip = d.get("ip") or "Недавно"
            d_seen = d.get("last_seen") or "Активно"
            del_form = f'''<form method="POST" action="/s/{quote(sub.subscription_uuid)}/devices/{quote(str(d_id))}/delete" style="margin:0;">
                <button type="submit" style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);padding:6px 12px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;">Отключить</button>
            </form>'''
            device_rows.append(f'''<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);margin-bottom:8px;">
                <div>
                    <div style="font-weight:700;font-size:13px;color:#fff;">{_e(d_name)}</div>
                    <div style="font-size:11px;color:#8e8e9a;font-family:monospace;margin-top:2px;">IP: {_e(d_ip)} · {_e(d_seen)}</div>
                </div>
                {del_form}
            </div>''')

        devices_html = "".join(device_rows) if device_rows else '<div style="text-align:center;padding:20px;color:#8e8e9a;font-size:12px;">Пока нет подключенных устройств</div>'

    # Dynamic replacements
    html_text = html_text.replace("{{integration_name}}", "Mister VPN")
    html_text = html_text.replace("{{integration_avatar}}", "/miniapp/static/mister-character.png")
    html_text = html_text.replace("{{plan_name}}", plan_name)
    html_text = html_text.replace("{{sub_status}}", status)
    html_text = html_text.replace("{{sub_end_date_full}}", expires_str)
    html_text = html_text.replace("{{sub_devices_used}}", str(used_devices))
    html_text = html_text.replace("{{sub_devices}}", str(max_devices))
    html_text = html_text.replace("{{sub_traffic_used_gb}}", traffic_used_gb)
    html_text = html_text.replace("{{sub_traffic_limit_gb}}", traffic_limit_gb)
    html_text = html_text.replace("{{sub_url}}", sub_url)
    html_text = html_text.replace("{{qr_code_url}}", f"https://api.qrserver.com/v1/create-qr-code/?size=260x260&data={quote(sub_url)}")
    html_text = html_text.replace("{{devices_list}}", devices_html)

    import re
    # Clean any leftover placeholders
    html_text = re.sub(r"\{\{[a-zA-Z0-9_]+\}\}", "", html_text)

    return html_text


def _render_slot_error_page(
    title: str,
    badge: str,
    subtitle: str,
    description: str,
    *,
    icon: str = "⚠️",
    slot_label: str | None = None,
    bot_url: str = "https://t.me/misterfvpn_bot",
) -> str:
    escaped_title = _e(title)
    escaped_badge = _e(badge)
    escaped_sub = _e(subtitle)
    escaped_desc = _e(description)
    escaped_bot = _e(bot_url)
    slot_tag_html = f'<div class="slot-tag">Слот: «{_e(slot_label)}»</div>' if slot_label else ""

    return f"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <title>{escaped_title} — Mister VPN</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {{
      color-scheme: dark;
      --bg: #050508;
      --glass-bg: rgba(255, 255, 255, 0.035);
      --glass-border: rgba(255, 255, 255, 0.1);
      --txt-main: #f8fafc;
      --txt-muted: #94a3b8;
      --txt-dim: #64748b;
      --accent: #38bdf8;
      --danger-bg: rgba(239, 68, 68, 0.12);
      --danger-border: rgba(239, 68, 68, 0.28);
    }}
    * {{
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
      margin: 0;
      padding: 0;
    }}
    body {{
      background-color: var(--bg);
      color: var(--txt-main);
      font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      overflow-x: hidden;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }}
    body::before {{
      content: '';
      position: fixed;
      top: -140px;
      left: 50%;
      transform: translateX(-50%);
      width: 580px;
      height: 420px;
      background: radial-gradient(circle, rgba(239, 68, 68, 0.16) 0%, rgba(99, 102, 241, 0.08) 45%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }}
    .wrap {{
      position: relative;
      z-index: 1;
      width: min(500px, 100%);
      margin: 0 auto;
      padding: 32px 20px 48px;
    }}
    .brand {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      padding: 0 4px;
    }}
    .brand-left {{
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 900;
      font-size: 18px;
      letter-spacing: -0.02em;
    }}
    .logo {{
      width: 42px;
      height: 42px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, #ffffff 0%, #a1a1aa 100%);
      color: #050508;
      font-weight: 900;
      font-size: 18px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(255, 255, 255, 0.15);
    }}
    .logo img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
    }}
    .status-pill {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 14px;
      border-radius: 9999px;
      background: var(--danger-bg);
      border: 1px solid var(--danger-border);
      color: #f87171;
    }}
    .card {{
      border-radius: 28px;
      border: 1px solid var(--glass-border);
      background: var(--glass-bg);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      padding: 38px 24px;
      text-align: center;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
      position: relative;
      overflow: hidden;
    }}
    .card::after {{
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    }}
    .icon-badge {{
      width: 72px;
      height: 72px;
      border-radius: 22px;
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.25);
      display: grid;
      place-items: center;
      margin: 0 auto 20px;
      font-size: 32px;
      box-shadow: 0 10px 30px rgba(239, 68, 68, 0.2);
    }}
    h1 {{
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
      color: #fff;
    }}
    .subhead {{
      font-size: 14px;
      color: #f87171;
      font-weight: 600;
      margin-bottom: 12px;
    }}
    .slot-tag {{
      display: inline-block;
      padding: 4px 12px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 13px;
      color: var(--txt-muted);
      margin-bottom: 16px;
    }}
    .desc {{
      font-size: 14px;
      line-height: 1.6;
      color: var(--txt-muted);
      margin-bottom: 32px;
      max-width: 400px;
      margin-left: auto;
      margin-right: auto;
    }}
    .actions {{
      display: flex;
      flex-direction: column;
      gap: 12px;
    }}
    .btn {{
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 16px 20px;
      border-radius: 18px;
      font-size: 15px;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      border: none;
    }}
    .btn-primary {{
      background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
      color: #fff;
      box-shadow: 0 12px 30px rgba(37, 99, 235, 0.35);
    }}
    .btn-primary:active {{
      transform: scale(0.98);
      filter: brightness(1.1);
    }}
    .btn-secondary {{
      background: rgba(255, 255, 255, 0.05);
      color: var(--txt-main);
      border: 1px solid var(--glass-border);
    }}
    .btn-secondary:active {{
      background: rgba(255, 255, 255, 0.08);
      transform: scale(0.98);
    }}
    .footer {{
      margin-top: 28px;
      text-align: center;
      font-size: 12px;
      color: var(--txt-dim);
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">
      <div class="brand-left">
        <div class="logo">
          <img src="/miniapp/static/mister-character.png" alt="Mister VPN" onerror="this.parentElement.innerHTML='M'">
        </div>
        <span>Mister VPN</span>
      </div>
      <div class="status-pill">{escaped_badge}</div>
    </div>

    <div class="card">
      <div class="icon-badge">{icon}</div>
      <h1>{escaped_title}</h1>
      <div class="subhead">{escaped_sub}</div>
      {slot_tag_html}
      <p class="desc">{escaped_desc}</p>

      <div class="actions">
        <a href="{escaped_bot}" class="btn btn-primary">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
          Открыть Mister VPN в Telegram
        </a>
        <button onclick="window.location.reload()" class="btn btn-secondary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
          Проверить снова
        </button>
      </div>
    </div>

    <div class="footer">
      Mister VPN — Защищённый доступ и стабильное соединение
    </div>
  </div>
</body>
</html>"""
