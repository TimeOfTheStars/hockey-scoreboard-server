from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from hockey_server.config import Settings
from hockey_server.models import Base


def make_engine(settings: Settings):
    path = Path(settings.database_path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    url = f"sqlite+aiosqlite:///{path}"
    engine = create_async_engine(
        url,
        echo=False,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _sqlite_pragma(dbapi_conn, _connection_record) -> None:
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    return engine


def make_session_factory(engine):
    return async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )


def _migrate_schema(sync_conn) -> None:
    """Синхронные миграции SQLite (после create_all)."""
    r = sync_conn.execute(text("PRAGMA table_info(users)"))
    cols = [row[1] for row in r.fetchall()]
    if "role" not in cols:
        sync_conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'operator'"
            )
        )
        sync_conn.execute(text("UPDATE users SET role = 'admin'"))

    r2 = sync_conn.execute(
        text(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='user_session_access'"
        )
    )
    if r2.fetchone() is None:
        sync_conn.execute(
            text(
                """
                CREATE TABLE user_session_access (
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                    PRIMARY KEY (user_id, session_id)
                )
                """
            )
        )


async def init_db(engine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrate_schema)


async def get_session(
    factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncSession]:
    async with factory() as session:
        yield session
