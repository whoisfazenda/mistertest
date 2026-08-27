# Публикация Mister VPN Mini App

Mini App и JSON API обслуживаются одним FastAPI-процессом. Публичная точка входа:

```text
https://vpn.example.com/miniapp
```

Telegram принимает для Web App публичный HTTPS URL. Для production нужен домен с постоянным сертификатом, а не временный туннель.

## 1. Подготовить сервер и домен

Подойдёт VPS с Ubuntu 24.04, Docker Engine, Docker Compose plugin и Caddy. В DNS создайте `A`-запись `vpn.example.com` на IPv4 сервера. Если используете IPv6, добавьте `AAAA`-запись.

В firewall оставьте снаружи только:

- `22/tcp` — SSH;
- `80/tcp` — выпуск и обновление TLS-сертификата;
- `443/tcp` — Mini App и вебхуки.

PostgreSQL наружу не публикуется, а FastAPI в `docker-compose.yml` привязан только к `127.0.0.1:8080`.

## 2. Загрузить проект

```bash
git clone <URL-репозитория> mister-vpn
cd mister-vpn
cp .env.example .env
chmod 600 .env
```

Если Git не используется, загрузите всю папку проекта через SFTP/rsync. Не загружайте локальные `.env`, `.venv`, PID-файлы, сборки и каталоги IDE.

## 3. Заполнить `.env`

Минимальная production-конфигурация:

```env
BOT_TOKEN=123456:telegram-token
MINIAPP_BOT_TOKEN=
ADMIN_IDS=123456789

POSTGRES_USER=vpn_user
POSTGRES_PASSWORD=replace_with_long_url_safe_password
POSTGRES_DB=vpn_db
DATABASE_URL=postgresql+asyncpg://vpn_user:replace_with_long_url_safe_password@db:5432/vpn_db

ADAPTGROUP_API_KEY=...
ADAPTGROUP_API_KEY_ID=...
ADAPTGROUP_WEBHOOK_SECRET=...

PUBLIC_BASE_URL=https://vpn.example.com
MINIAPP_URL=https://vpn.example.com/miniapp
DEV_MODE=false
SUPPORT_URL=https://t.me/mistervpnsup_bot
```

Оставьте `MINIAPP_BOT_TOKEN` пустым, если Mini App открывается из того же бота, чей токен указан в `BOT_TOKEN`. Отдельный токен нужен только когда Mini App зарегистрирован на другом боте: сервер проверяет подпись `initData` именно этим токеном.

Для реальной оплаты заполните настройки выбранного провайдера и замените `PAYMENT_PROVIDER=mock` на `rollypay` или `yookassa`. `DEV_MODE` в production всегда должен быть `false`.

## 4. Запустить контейнеры

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 migrate api bot
```

Миграции запускаются контейнером `migrate`; `bot` и `api` стартуют после их успешного завершения.

Локальная проверка на сервере:

```bash
curl http://127.0.0.1:8080/health
```

Ожидаемый ответ содержит статус `ok`.

## 5. Включить HTTPS через Caddy

Создайте `/etc/caddy/Caddyfile`:

```caddyfile
vpn.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8080
}
```

Проверка и применение:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl https://vpn.example.com/health
curl -I https://vpn.example.com/miniapp
```

Caddy автоматически получает и обновляет TLS-сертификат. DNS уже должен указывать на сервер, а порты 80 и 443 должны быть доступны.

## 6. Подключить Mini App к Telegram

После запуска `bot` сам устанавливает кнопку меню «Открыть Mister VPN», если задан `MINIAPP_URL` (или `PUBLIC_BASE_URL`, из которого строится `/miniapp`).

Если хотите настроить кнопку вручную:

1. Откройте `@BotFather` и выберите нужного бота.
2. Откройте **Bot Settings → Menu Button** (либо команду `/setmenubutton`).
3. Укажите текст кнопки и URL `https://vpn.example.com/miniapp`.
4. При желании отдельно настройте **Main Mini App**, чтобы кнопка запуска появилась в профиле бота.

Открывайте приложение именно из Telegram, а не обычной вкладкой браузера: Telegram передаёт подписанный `initData`, без которого production API вернёт `401`.

## 7. Настроить внешние вебхуки

В кабинетах интеграций укажите:

```text
AdaptGroup: https://vpn.example.com/webhooks/adaptgroup
RollyPay:   https://vpn.example.com/webhooks/rollypay
```

Секрет AdaptGroup должен совпадать с `ADAPTGROUP_WEBHOOK_SECRET`, а для RollyPay заполните `ROLLYPAY_SIGNING_SECRET`. Не публикуйте эти значения в Git или логах.

## 8. Обновлять приложение

```bash
cd mister-vpn
git pull --ff-only
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 migrate api bot
```

Статические файлы Mini App входят в Docker-образ, поэтому после пересборки подтягиваются вместе с backend. В URL CSS, JS и изображения есть версия, чтобы Telegram WebView не показывал старый кэш.

## Быстрая диагностика

- `502` от Caddy: контейнер `api` не запущен или не слушает `127.0.0.1:8080`.
- `401 Open this Mini App from Telegram`: приложение открыто вне Telegram либо `MINIAPP_BOT_TOKEN` не соответствует боту запуска.
- Кнопка меню не появилась: проверьте HTTPS URL и логи `bot`; затем настройте Menu Button через BotFather.
- Тарифы пусты: проверьте AdaptGroup credentials и синхронизацию тарифов в админ-разделе.
- Оплата не создаётся: проверьте `PAYMENT_PROVIDER` и credentials выбранного платёжного провайдера.
