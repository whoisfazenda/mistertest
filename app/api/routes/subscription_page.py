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
    accept = request.headers.get("accept", "").lower()
    ua = request.headers.get("user-agent", "").lower()
    vpn_clients = ("happ", "incy", "v2ray", "sing-box", "clash", "karing", "streisand", "shadowrocket", "v2box", "nekobox", "sagernet")
    if any(vc in ua for vc in vpn_clients):
        return False
    return "text/html" in accept or "mozilla" in ua or "safari" in ua or "chrome" in ua


@router.get("/s/{subscription_uuid}", response_class=HTMLResponse)
@router.get("/subscription/{subscription_uuid}", response_class=HTMLResponse)
async def subscription_page(request: Request, subscription_uuid: str) -> HTMLResponse:
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

    return HTMLResponse(_render_page(sub, devices, deleted=deleted, error=error, base_url=base_url))


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
            timeout=httpx.Timeout(20.0, connect=5.0),
            follow_redirects=True,
        ) as client:
            upstream = await client.get(upstream_url, headers=request_headers)
        if upstream.status_code >= 400:
            return RedirectResponse(upstream_url, status_code=307)
    except (httpx.HTTPError, ValueError):
        return RedirectResponse(upstream_url, status_code=307)

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


@router.get("/{subscription_uuid}")
async def direct_subscription_route(request: Request, subscription_uuid: str) -> Response:
    """Handle direct clean URLs like https://sub.misterv.site/{uuid}."""
    if subscription_uuid in RESERVED_ROOT_PATHS or len(subscription_uuid) < 8:
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
) -> str:
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
    
    plan_name = sub.plan_name or "Mister Unlimited VIP"
    if sub.is_trial:
        plan_name = "Пробный период (3 дня)"
        
    expires_str = format_date(sub.expires_at) if sub.expires_at else "Бессрочно"
    
    used_devices = len(devices)
    max_devices = sub.max_devices or 5
    
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

    return html_text
