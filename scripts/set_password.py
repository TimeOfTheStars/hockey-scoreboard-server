#!/usr/bin/env python3
"""
Сменить пароль существующего пользователя (тот же bcrypt, что у сервера).

  python scripts/set_password.py <логин> <новый_пароль>

Путь к БД: DATABASE_PATH или .env в корне репозитория (как у add_user.py).
Остановка сервиса не обязательна (SQLite пишет короткую транзакцию).
"""

from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path

import bcrypt


def _load_dotenv() -> None:
    root = Path(__file__).resolve().parent.parent
    for name in (".env",):
        p = root / name
        if not p.is_file():
            continue
        for raw in p.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


def main() -> None:
    _load_dotenv()
    if len(sys.argv) != 3:
        print(
            "Использование: python scripts/set_password.py <логин> <новый_пароль>",
            file=sys.stderr,
        )
        sys.exit(2)

    username, password = sys.argv[1].strip(), sys.argv[2]
    if not username:
        print("Пустой логин.", file=sys.stderr)
        sys.exit(2)
    if not password:
        print("Пустой пароль.", file=sys.stderr)
        sys.exit(2)

    db_path = os.environ.get("DATABASE_PATH", "./data/hockey.db")
    db_path = str(Path(db_path).resolve())

    pwd_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode(
        "ascii"
    )

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.execute(
            "UPDATE users SET password_hash = ? WHERE username = ?",
            (pwd_hash, username),
        )
        conn.commit()
        if cur.rowcount == 0:
            print(f"Пользователь «{username}» не найден ({db_path}).", file=sys.stderr)
            sys.exit(1)
    except sqlite3.OperationalError as e:
        print(f"Ошибка БД ({db_path}): {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()

    print(f"Пароль для «{username}» обновлён ({db_path}).")


if __name__ == "__main__":
    main()
