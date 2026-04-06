# Hockey Scoreboard Server

HTTP-сервер на **Python (FastAPI + Uvicorn) + SQLite**: несколько сеансов (UUID), вход по паролю (cookie `hockey_auth`). Роли **admin** (создание/удаление сеансов и пользователей, страница `/admin/users`) и **operator** (только назначенные матчи). Веб-панель и пульт — React/Vite (`src/`), отдаются из `dist/`.

## Быстрый старт

1. Установите зависимости и соберите фронт:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -e .

   npm install
   npm run build
   ```

2. Задайте окружение (см. [.env.example](.env.example)) и запустите API:

   ```bash
   export ADMIN_USERNAME=admin
   export ADMIN_PASSWORD='надёжный-пароль'
   export JWT_SECRET='длинная-случайная-строка'
   uvicorn hockey_server.main:create_app --factory --host 0.0.0.0 --port 8765
   ```

3. Откройте `http://127.0.0.1:8765/`, войдите, создайте сеанс.

4. В Hockey Desktop Host укажите URL:

   `http://<ваш-сервер>:8765/api/sessions/<uuid-сеанса>/vmix`

Панель: `/editor/<uuid>`, пульт: `/mobile/<uuid>`. **GET** `…/vmix` и `…/state` — без входа (достаточно UUID, чтобы Host/vMix могли опрашивать API). **PATCH**, сброс и список сеансов — с cookie; оператор видит и правит только назначенные матчи. Создание и удаление сеансов — только **admin**. Не разглашайте UUID, если не хотите, чтобы счёт читали по ссылке.

Скрипт [`scripts/add_user.py`](scripts/add_user.py): третий аргумент — `admin` или `operator` (по умолчанию `operator`).

## Разработка

- Бэкенд: `uvicorn hockey_server.main:create_app --factory --reload --port 8765`
- Фронт: `npm run dev` (Vite проксирует `/api` на `127.0.0.1:8765`)

Тесты:

```bash
pip install -e ".[dev]"
pytest
```

## Деплой на VDS

1. `pip install -e .` в venv или `pip install .` и перенос `hockey_server`, `dist/`.
2. Переменные: `DATABASE_PATH`, `JWT_SECRET`, `STATIC_DIR` (каталог с `index.html`), за HTTPS — `COOKIE_SECURE=true`.
3. Nginx/Caddy: TLS и `proxy_pass` на `127.0.0.1:8765`.

Пример **systemd**:

```ini
[Unit]
Description=Hockey Scoreboard Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/hockey-scoreboard
Environment=DATABASE_PATH=/opt/hockey-scoreboard/data/hockey.db
Environment=STATIC_DIR=/opt/hockey-scoreboard/dist
EnvironmentFile=/opt/hockey-scoreboard/.env
ExecStart=/opt/hockey-scoreboard/.venv/bin/uvicorn hockey_server.main:create_app --factory --host 127.0.0.1 --port 8765
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

При пустой БД один раз задайте `ADMIN_USERNAME` и `ADMIN_PASSWORD` для создания администратора.

### Дополнительные пользователи

В веб-интерфейсе регистрации нет. Новых пользователей можно добавить **скриптом** (из корня проекта, venv активирован, установлено `pip install -e .`):

```bash
python scripts/add_user.py operator2 'НадёжныйПароль'
```

Путь к базе берётся из `DATABASE_PATH` или из `.env`. Логин должен быть уникальным.

Сейчас все пользователи видят **один и тот же** список сеансов (изоляции по владельцу в UI нет).

## Таймер

При `Running: true` раз в секунду уменьшается `Timer` (`MM:SS`); при `00:00` останавливается. Тикает `PowerPlayTimer` при активном большинстве. Сброс на пульте использует `TimerBaseline` (логика как в прежней спецификации).

## HTTP API

| Метод | Путь | Доступ |
|--------|------|--------|
| `POST` | `/api/auth/login` | JSON: `username`, `password` |
| `POST` | `/api/auth/logout` | после входа |
| `GET` | `/api/sessions` | список (cookie) |
| `POST` | `/api/sessions` | создать |
| `DELETE` | `/api/sessions/:id` | удалить |
| `GET` | `/api/sessions/:id/vmix` | публично |
| `GET` | `/api/sessions/:id/state` | публично |
| `PATCH` | `/api/sessions/:id/state` | cookie |
| `POST` | `/api/sessions/:id/reset` | cookie |

## Технологии

FastAPI, SQLAlchemy (async) + aiosqlite, bcrypt, PyJWT; React + Vite + TypeScript.
