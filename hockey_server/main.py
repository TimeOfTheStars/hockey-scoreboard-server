from __future__ import annotations

import asyncio
import contextlib
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID

import bcrypt
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from hockey_server.config import Settings
from hockey_server.db import init_db, make_engine, make_session_factory
from hockey_server.game_logic import tick_timers
from hockey_server.models import SessionModel, User
from hockey_server.routes import router as api_router
from hockey_server.schemas import GameState
from hockey_server.state import SessionRuntime


async def bootstrap_admin(
    settings: Settings,
    factory: async_sessionmaker[AsyncSession],
) -> None:
    async with factory() as session:
        n = await session.scalar(select(func.count()).select_from(User))
        if n and n > 0:
            return
        u = settings.admin_username
        p = settings.admin_password
        if not u or not p:
            print(
                "hockey-scoreboard-server: нет пользователей; задайте ADMIN_USERNAME "
                "и ADMIN_PASSWORD для первого входа",
                file=sys.stderr,
            )
            return
        h = bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("ascii")
        session.add(User(username=u, password_hash=h, role="admin"))
        await session.commit()
        print(f"hockey-scoreboard-server: создан администратор `{u}`", file=sys.stderr)


async def load_sessions(
    factory: async_sessionmaker[AsyncSession],
    runtime: SessionRuntime,
) -> None:
    async with factory() as session:
        r = await session.execute(select(SessionModel))
        for m in r.scalars().all():
            try:
                sid = UUID(m.id)
            except ValueError:
                continue
            gs = GameState.model_validate_json(m.game_state_json)
            runtime.register(sid, gs)


async def timer_loop(
    factory: async_sessionmaker[AsyncSession],
    runtime: SessionRuntime,
) -> None:
    while True:
        await asyncio.sleep(1)
        for sid in list(runtime.all_ids()):
            new_st = await runtime.try_tick(sid, tick_timers)
            if new_st is None:
                continue
            async with factory() as session:
                await session.execute(
                    update(SessionModel)
                    .where(SessionModel.id == str(sid))
                    .values(
                        game_state_json=new_st.model_dump_json(by_alias=True)
                    )
                )
                await session.commit()


def build_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    jwt_secret = (settings.jwt_secret or "").strip()
    if not jwt_secret:
        print(
            "hockey-scoreboard-server: JWT_SECRET не задан — небезопасный ключ по умолчанию "
            "(только для разработки)",
            file=sys.stderr,
        )
        jwt_secret = "dev-insecure-jwt-secret-change-me"

    engine = make_engine(settings)
    session_factory = make_session_factory(engine)
    runtime = SessionRuntime()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await init_db(engine)
        await bootstrap_admin(settings, session_factory)
        await load_sessions(session_factory, runtime)
        tick_task = asyncio.create_task(timer_loop(session_factory, runtime))
        yield
        tick_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await tick_task
        await engine.dispose()

    app = FastAPI(lifespan=lifespan)

    app.state.jwt_secret = jwt_secret
    app.state.cookie_secure = settings.cookie_secure
    app.state.session_factory = session_factory
    app.state.runtime = runtime
    app.state.settings = settings

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api")

    static_root: Path = settings.resolved_static_dir()
    index = static_root / "index.html"
    static_abs = static_root.resolve()

    if index.is_file():

        @app.get("/", include_in_schema=False)
        async def root_index():
            return FileResponse(index)

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa(full_path: str):
            if full_path.startswith("api"):
                return PlainTextResponse("Not Found", status_code=404)
            cand = (static_root / full_path).resolve()
            try:
                cand.relative_to(static_abs)
            except ValueError:
                return FileResponse(index)
            if cand.is_file():
                return FileResponse(cand)
            return FileResponse(index)

    else:
        print(
            "hockey-scoreboard-server: нет index.html в STATIC_DIR / dist — "
            "выполните npm run build или укажите STATIC_DIR",
            file=sys.stderr,
        )

        @app.get("/{full_path:path}", include_in_schema=False)
        async def no_frontend(full_path: str):
            if full_path.startswith("api"):
                return PlainTextResponse("Not Found", status_code=404)
            return PlainTextResponse(
                "Соберите фронт (npm run build) или укажите STATIC_DIR.",
                status_code=404,
            )

    return app


def create_app() -> FastAPI:
    """Точка входа для `uvicorn hockey_server.main:create_app --factory`."""
    return build_app()
