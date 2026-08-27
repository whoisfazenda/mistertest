"""Pterodactyl entrypoint.

The Python egg runs ``python ${PY_FILE}``, so module commands like
``python -m alembic upgrade head && python -m app.main_bot`` cannot be placed
directly into PY_FILE. This file performs the same steps from Python:
run database migrations first, then start the Telegram bot.
"""
from __future__ import annotations

import asyncio
import importlib
import importlib.util
import os
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config

ROOT = Path(__file__).resolve().parent
LOCAL_SITE = ROOT / ".local" / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages"
TLS_CERT_FILE = ROOT / "certs" / "fullchain.pem"
TLS_KEY_FILE = ROOT / "certs" / "privkey.pem"

for path in (ROOT, LOCAL_SITE):
    value = str(path)
    if value not in sys.path:
        sys.path.insert(0, value)


def import_bot_main():
    try:
        return importlib.import_module("app.main_bot").main
    except ModuleNotFoundError as exc:
        root_entrypoint = ROOT / "main_bot.py"
        if root_entrypoint.exists():
            spec = importlib.util.spec_from_file_location("pterodactyl_main_bot", root_entrypoint)
            if spec is not None and spec.loader is not None:
                module = importlib.util.module_from_spec(spec)
                sys.modules["pterodactyl_main_bot"] = module
                spec.loader.exec_module(module)
                main = getattr(module, "main", None)
                if main is not None:
                    return main

        print("Could not import app.main_bot.", file=sys.stderr)
        print(f"Project root: {ROOT}", file=sys.stderr)
        print(f"Root exists: {ROOT.exists()}", file=sys.stderr)
        print(f"app dir exists: {(ROOT / 'app').exists()}", file=sys.stderr)
        if ROOT.exists():
            names = ", ".join(sorted(p.name for p in ROOT.iterdir())[:50])
            print(f"Root files: {names}", file=sys.stderr)
        print("sys.path:", file=sys.stderr)
        for item in sys.path:
            print(f"  - {item}", file=sys.stderr)
        raise exc


def run_migrations() -> None:
    config = Config("alembic.ini")
    command.upgrade(config, "head")


async def run_services() -> None:
    """Run Telegram long polling and the public subscription API together."""
    import uvicorn

    from app.core.config import settings

    bot_main = import_bot_main()
    public_port = int(os.environ.get("SERVER_PORT") or 20173)
    if not TLS_CERT_FILE.is_file() or not TLS_KEY_FILE.is_file():
        raise FileNotFoundError(
            "HTTPS certificate files are missing: "
            f"{TLS_CERT_FILE} and {TLS_KEY_FILE}"
        )
    api_server = uvicorn.Server(
        uvicorn.Config(
            "app.main_api:app",
            host=settings.webhook_host,
            port=public_port,
            log_level=settings.log_level.lower(),
            access_log=False,
            ssl_certfile=str(TLS_CERT_FILE),
            ssl_keyfile=str(TLS_KEY_FILE),
        )
    )
    bot_task = asyncio.create_task(bot_main(), name="telegram-bot")
    api_task = asyncio.create_task(api_server.serve(), name="subscription-api")
    tasks = {bot_task, api_task}
    try:
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            await task
    finally:
        api_server.should_exit = True
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    run_migrations()
    asyncio.run(run_services())
