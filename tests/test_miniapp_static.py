"""Tests for serving compiled Mini App assets and index."""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main_api import app


@pytest.mark.asyncio
async def test_miniapp_index_served():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/miniapp")
        assert res.status_code == 200
        assert "Mister VPN" in res.text
        assert '<div id="root"></div>' in res.text
        assert res.headers.get("x-content-type-options") == "nosniff"


@pytest.mark.asyncio
async def test_miniapp_assets_served():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Check character assets
        res = await client.get("/miniapp/assets/main.png")
        assert res.status_code == 200
        assert res.headers.get("content-type", "").startswith("image/")
