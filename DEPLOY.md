# План деплоя Hockey Scoreboard Server

Документ описывает пошаговый вывод приложения в продакшен на типичном **VDS/VPS** (Linux). Стек: **Python 3.11+**, **Uvicorn**, **SQLite**, статика **React/Vite** из каталога `dist/`, опционально **Nginx** или **Caddy** как reverse proxy с TLS.

---

## 1. Цели и границы

- Один процесс **Uvicorn** отдаёт и **REST API** (`/api/...`), и **SPA** (корень и `index.html` для маршрутов фронта).
- Данные — **один файл SQLite** (`DATABASE_PATH`); бэкапы = копирование этого файла.
- Вход операторов/админа — **cookie** `hockey_auth`; за **HTTPS** нужно включить **`COOKIE_SECURE=true`**.

---

## 2. Требования к серверу

| Компонент | Минимум / рекомендация |
|-----------|-------------------------|
| ОС | Debian 12 / Ubuntu 22.04+ (или другой Linux с systemd) |
| CPU/RAM | 1 vCPU, 512 MB RAM достаточно для небольшой нагрузки |
| Диск | 10+ GB; место под БД и логи |
| Python | **3.11+** (см. `pyproject.toml`) |
| Node.js | **20.x LTS** или **22.x** (для `npm run build` на сервере или на CI) |
| Сеть | Открытый **443** (HTTPS) и/или **80** (редирект на HTTPS); порт приложения (например **8765**) можно оставить только на `127.0.0.1` |

---

## 3. Учётные записи и безопасность (до установки)

1. **SSH**: ключи вместо пароля, при необходимости `fail2ban`.
2. **Пользователь для сервиса**: отдельный системный пользователь (например `hockey`), без логина в shell или с ограниченным shell — приложение не должно работать от `root`.
3. **Секреты**:
   - `JWT_SECRET` — длинная случайная строка (например 32+ байта в hex/base64).
   - `ADMIN_PASSWORD` — только для **первого** создания админа при пустой БД; потом менять пароль логично через политику организации (отдельной смены пароля в UI может не быть — уточняйте по коду).
4. **Файрвол**: `ufw allow OpenSSH`, `ufw allow 80,443/tcp`, `ufw enable` (пример для UFW).

---

## 4. Каталог установки и перенос кода

Рекомендуемый путь (пример): `/opt/hockey-scoreboard`.

### 4.1. Вариант A — `git clone` на сервере

```bash
sudo mkdir -p /opt/hockey-scoreboard
sudo chown "$USER:$USER" /opt/hockey-scoreboard
cd /opt/hockey-scoreboard
git clone <URL-репозитория> .
```

### 4.2. Вариант B — сборка на CI и копирование артефактов

На CI: `npm ci && npm run build`, сохранить `dist/`; на сервер переносятся как минимум:

- пакет приложения: каталог `hockey_server/`, `pyproject.toml` (или wheel/sdist после `pip wheel`);
- `dist/` после сборки фронта.

Убедитесь, что версия Python на сервере совпадает с ожидаемой (3.11+).

---

## 5. Python: виртуальное окружение и зависимости

```bash
cd /opt/hockey-scoreboard
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -e .
```

Продакшен-зависимости берутся из основного списка в `pyproject.toml` (FastAPI, Uvicorn, SQLAlchemy, и т.д.). Тестовые (`[dev]`) на сервере не обязательны.

Проверка:

```bash
.venv/bin/python -c "import hockey_server.main; print('ok')"
```

---

## 6. Фронтенд: сборка статики

На сервере (или на машине сборки с тем же исходником):

```bash
cd /opt/hockey-scoreboard
npm ci
npm run build
```

Должен появиться каталог **`dist/`** с `index.html` и ассетами.

Переменная **`STATIC_DIR`** (если задана) должна указывать на этот каталог; иначе приложение ищет `dist/` относительно корня проекта (см. `hockey_server/config.py` → `resolved_static_dir()`).

После каждого обновления фронта повторяйте `npm run build` и перезапуск сервиса (если нужно сбросить кэш браузера — по политике версионирования).

---

## 7. Переменные окружения

Создайте файл **`/opt/hockey-scoreboard/.env`** (права `600`, владелец — пользователь сервиса). Ориентир — [.env.example](.env.example).

| Переменная | Назначение |
|------------|------------|
| `DATABASE_PATH` | Путь к SQLite (каталог должен существовать или создаваться скриптом/вручную). Пример: `/opt/hockey-scoreboard/data/hockey.db` |
| `JWT_SECRET` | Подпись JWT в cookie; **обязательно** задать в проде |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Если БД **пустая**, при первом старте создаётся администратор |
| `COOKIE_SECURE` | `true` при работе **только по HTTPS** (иначе браузер может не отправлять cookie) |
| `STATIC_DIR` | Абсолютный путь к `dist`, если не стандартное расположение |

Дополнительно (не из `.env.example`, но полезно через systemd):

- `Environment=PYTHONUNBUFFERED=1` — логи без буферизации.

**Важно:** не коммитьте `.env` в git.

---

## 8. Данные и резервное копирование

1. Создать каталог данных:

   ```bash
   sudo mkdir -p /opt/hockey-scoreboard/data
   sudo chown hockey:hockey /opt/hockey-scoreboard/data
   ```

2. **Бэкап**: периодически копировать файл `hockey.db` (или весь `data/`). SQLite безопасно копировать при остановленном сервисе или с использованием `.backup` через `sqlite3` — для минимального риска останавливайте сервис на секунды крона.

3. **Восстановление**: остановить сервис, положить файл БД, запустить сервис.

---

## 9. Запуск Uvicorn

Рабочая команда (за прокси слушаем только localhost):

```bash
cd /opt/hockey-scoreboard
set -a && source .env && set +a
.venv/bin/uvicorn hockey_server.main:create_app --factory --host 127.0.0.1 --port 8765
```

Для первой проверки без прокси (только временно, не в открытую сеть без TLS):

```bash
--host 0.0.0.0 --port 8765
```

Откройте в браузере `http://<IP>:8765/` — должна открыться SPA, `/api/...` отвечает.

---

## 10. systemd: сервис в фоне

Файл **`/etc/systemd/system/hockey-scoreboard.service`** (пример; пути и пользователя подставьте свои):

```ini
[Unit]
Description=Hockey Scoreboard Server
After=network.target

[Service]
Type=simple
User=hockey
Group=hockey
WorkingDirectory=/opt/hockey-scoreboard
Environment=PYTHONUNBUFFERED=1
Environment=DATABASE_PATH=/opt/hockey-scoreboard/data/hockey.db
Environment=STATIC_DIR=/opt/hockey-scoreboard/dist
EnvironmentFile=/opt/hockey-scoreboard/.env
ExecStart=/opt/hockey-scoreboard/.venv/bin/uvicorn hockey_server.main:create_app --factory --host 127.0.0.1 --port 8765
Restart=on-failure
RestartSec=5

# Опционально: ограничения
# LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

Активация:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hockey-scoreboard
sudo systemctl status hockey-scoreboard
journalctl -u hockey-scoreboard -f
```

---

## 11. Reverse proxy и TLS

### 11.1. Общие требования

- Проксируйте на `http://127.0.0.1:8765`.
- Пробрасывайте заголовки, если позже понадобится знание схемы/хоста: `X-Forwarded-Proto`, `X-Forwarded-For`, `Host` (для cookie `Path=/` обычно достаточно корня).
- После включения HTTPS установите **`COOKIE_SECURE=true`** и перезапустите сервис.

### 11.2. Nginx (фрагмент)

```nginx
server {
    listen 443 ssl http2;
    server_name scoreboard.example.com;

    ssl_certificate     /etc/letsencrypt/live/scoreboard.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/scoreboard.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8765;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Редирект с 80 на 443 — по стандартным шаблонам Let’s Encrypt.

### 11.3. Caddy (минимально)

```caddy
scoreboard.example.com {
    reverse_proxy 127.0.0.1:8765
}
```

---

## 12. Проверки после деплоя

1. **HTTPS**: открыть `https://<домен>/`, нет смешанного контента.
2. **Логин**: `POST /api/auth/login`, в браузере cookie с флагом Secure (в DevTools).
3. **Список сеансов** под админом: `GET /api/sessions`.
4. **Создание сеанса** с одним/двумя полями (если используете UI).
5. **Host**: `GET https://<домен>/api/sessions/<uuid>/vmix` — ответ **JSON-массив** с одним объектом (формат арены).
6. **Оператор**: выдать доступ к сеансу в `/admin/users`, убедиться, что видит только разрешённые матчи.

---

## 13. Обновление версии (релиз)

Рекомендуемый порядок:

1. Бэкап `DATABASE_PATH`.
2. `git pull` (или выкладка нового артефакта).
3. `source .venv/bin/activate && pip install -e .` (если менялись зависимости).
4. `npm ci && npm run build` (если менялся фронт).
5. `sudo systemctl restart hockey-scoreboard`.
6. Проверить `journalctl -u hockey-scoreboard -n 50` и смоук-тесты из раздела 12.

При изменении схемы БД в коде могут быть миграции при старте — смотрите `hockey_server/db.py` и логи первого запуска после обновления.

---

## 14. Мониторинг и логи

- **systemd**: `journalctl -u hockey-scoreboard`.
- Диск: рост SQLite и ротация логов journald.
- При необходимости вынесите access/error логи прокси (Nginx/Caddy) в отдельный анализ.

Отдельного health-эндпоинта в проекте может не быть; для uptime-check можно использовать `GET /` (200 и HTML) или `GET /api/sessions` с ожидаемым 401 без cookie — в зависимости от того, что допустимо для вашего монитора.

---

## 15. Чеклист безопасности

- [ ] `JWT_SECRET` задан и не совпадает с дефолтом из логов разработки  
- [ ] `COOKIE_SECURE=true` при HTTPS  
- [ ] Uvicorn не слушает `0.0.0.0` в проде без необходимости; наружу — только прокси  
- [ ] Права на `.env` и `data/hockey.db` только у пользователя сервиса  
- [ ] SSH и система обновлены  
- [ ] UUID сеансов и URL `/vmix` не публиковать публично, если счёт считается чувствительным  

---

## 16. Дополнительные пользователи и роли

- Админ создаёт операторов в **`/admin/users`** (веб).
- Либо скрипт: [`scripts/add_user.py`](scripts/add_user.py) с ролью `admin` или `operator` (см. README).

---

## 17. Откат (rollback)

1. Остановить сервис.  
2. Восстановить предыдущий каталог приложения / предыдущий коммит и `dist/`.  
3. Восстановить БД из бэкапа **только если** новая версия портила данные.  
4. Запустить сервис, проверить логи.

---

## 18. Опционально: контейнеризация

В репозитории может не быть готового Dockerfile. Если понадобится Docker:

- образ на базе `python:3.11-slim`, копия `hockey_server`, установка `pip install .`, копия `dist/`;  
- том для `DATABASE_PATH`;  
- тот же reverse proxy перед контейнером для TLS.

Это не обязательный шаг для VDS с systemd.

---

*Документ можно дополнять под вашу инфраструктуру (Ansible, Docker Compose, Kubernetes). При изменении переменных окружения или точек входа сверяйтесь с `hockey_server/config.py` и `README.md`.*
