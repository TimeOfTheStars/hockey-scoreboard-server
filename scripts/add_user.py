#!/usr/bin/env python3
"""
Добавить пользователя в SQLite (тот же формат пароля bcrypt, что и у сервера).

Использование (из корня репозитория, с активированным venv и pip install -e .):

  python scripts/add_user.py ИМЯ ПАРОЛЬ

Путь к БД: переменная DATABASE_PATH или значение из файла .env рядом с репозиторием.
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
    if len(sys.argv) not in (3, 4):
        print(
            "Использование: python scripts/add_user.py <логин> <пароль> [admin|operator]",
            file=sys.stderr,
        )
        sys.exit(2)

    username, password = sys.argv[1], sys.argv[2]
    role = (sys.argv[3] if len(sys.argv) == 4 else "operator").strip().lower()
    if role not in ("admin", "operator"):
        print("Роль должна быть admin или operator.", file=sys.stderr)
        sys.exit(2)
    if not username.strip():
        print("Пустой логин.", file=sys.stderr)
        sys.exit(2)

    db_path = os.environ.get("DATABASE_PATH", "./data/hockey.db")
    db_path = str(Path(db_path).resolve())

    pwd_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode(
        "ascii"
    )

    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            (username, pwd_hash, role),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        print(f"Пользователь «{username}» уже существует.", file=sys.stderr)
        sys.exit(1)
    except sqlite3.OperationalError as e:
        print(f"Ошибка БД ({db_path}): {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()

    print(f"Пользователь «{username}» добавлен ({db_path}).")


if __name__ == "__main__":
    main()
