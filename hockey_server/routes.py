from __future__ import annotations

import time
from typing import Annotated, Any
from uuid import UUID, uuid4

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from hockey_server import auth
from hockey_server.auth import (
    AUTH_COOKIE,
    ROLE_ADMIN,
    ROLE_OPERATOR,
    require_admin_role,
    require_user_id,
)
from hockey_server.game_logic import merge_patch_and_sync, tick_timers
from hockey_server.models import SessionModel, User, UserSessionAccess
from hockey_server.schemas import (
    CreateSessionBody,
    CreateUserBody,
    GameState,
    LoginBody,
    MeOut,
    PatchUserBody,
    PutUserSessionsBody,
    SessionRow,
    UserOut,
    default_game_state,
)
from hockey_server.vmix_payload import build_vmix_array
from hockey_server.state import SessionRuntime

router = APIRouter()


def _session_dep(request: Request) -> SessionRuntime:
    return request.app.state.runtime


def _session_factory_dep(
    request: Request,
) -> async_sessionmaker[AsyncSession]:
    return request.app.state.session_factory


RuntimeDep = Annotated[SessionRuntime, Depends(_session_dep)]
SessionFactoryDep = Annotated[
    async_sessionmaker[AsyncSession], Depends(_session_factory_dep)
]


async def get_current_user(
    request: Request,
    factory: SessionFactoryDep,
) -> User:
    uid = require_user_id(request)
    async with factory() as session:
        r = await session.execute(select(User).where(User.id == uid).limit(1))
        row = r.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid session",
        )
    return row


CurrentUserDep = Annotated[User, Depends(get_current_user)]


async def require_admin(
    user: CurrentUserDep,
) -> User:
    require_admin_role(user.role)
    return user


AdminDep = Annotated[User, Depends(require_admin)]


async def _count_admins(
    factory: async_sessionmaker[AsyncSession],
    exclude_user_id: int | None = None,
) -> int:
    async with factory() as session:
        q = select(func.count()).select_from(User).where(User.role == ROLE_ADMIN)
        if exclude_user_id is not None:
            q = q.where(User.id != exclude_user_id)
        n = await session.scalar(q)
    return int(n or 0)


async def _ensure_session_access(
    factory: async_sessionmaker[AsyncSession],
    user: User,
    session_id: UUID,
) -> None:
    if user.role == ROLE_ADMIN:
        return
    sid = str(session_id)
    async with factory() as session:
        r = await session.execute(
            select(UserSessionAccess).where(
                UserSessionAccess.user_id == user.id,
                UserSessionAccess.session_id == sid,
            )
        )
        row = r.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="no access to this session",
        )


def _validate_user_role(role: str) -> str:
    if role not in (ROLE_ADMIN, ROLE_OPERATOR):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="role must be admin or operator",
        )
    return role


@router.get("/me", response_model=MeOut)
async def get_me(user: CurrentUserDep) -> MeOut:
    return MeOut(id=user.id, username=user.username, role=user.role)


@router.post("/auth/login")
async def login(
    request: Request,
    body: LoginBody,
    factory: SessionFactoryDep,
    response: Response,
):
    async with factory() as session:
        row = await session.execute(
            select(User).where(User.username == body.username).limit(1)
        )
        u = row.scalar_one_or_none()
    if u is None or not bcrypt.checkpw(
        body.password.encode("utf-8"),
        u.password_hash.encode("utf-8"),
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid credentials",
        )
    exp = int(time.time()) + 14 * 24 * 3600
    token = auth.encode_jwt(u.id, request.app.state.jwt_secret, exp)
    response.set_cookie(
        key=AUTH_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=14 * 24 * 3600,
        secure=bool(request.app.state.cookie_secure),
        path="/",
    )
    return {"ok": True, "user_id": u.id, "role": u.role}


@router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie(AUTH_COOKIE, path="/")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users", response_model=list[UserOut])
async def list_users(factory: SessionFactoryDep, _: AdminDep) -> list[UserOut]:
    async with factory() as session:
        r = await session.execute(select(User).order_by(User.id.asc()))
        users = r.scalars().all()
        out: list[UserOut] = []
        for u in users:
            if u.role == ROLE_OPERATOR:
                sr = await session.execute(
                    select(UserSessionAccess.session_id).where(
                        UserSessionAccess.user_id == u.id
                    )
                )
                sids = list(sr.scalars().all())
            else:
                sids = []
            out.append(
                UserOut(
                    id=u.id,
                    username=u.username,
                    role=u.role,
                    session_ids=sids,
                )
            )
    return out


@router.post("/users", response_model=UserOut)
async def create_user(
    factory: SessionFactoryDep,
    body: CreateUserBody,
    _: AdminDep,
) -> UserOut:
    role = _validate_user_role(body.role.strip())
    uname = body.username.strip()
    if not uname or not body.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="username and password required",
        )
    h = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt()).decode(
        "ascii"
    )
    async with factory() as session:
        session.add(User(username=uname, password_hash=h, role=role))
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="username taken",
            ) from None
        r = await session.execute(select(User).where(User.username == uname))
        u = r.scalar_one()
    return UserOut(id=u.id, username=u.username, role=u.role, session_ids=[])


@router.patch("/users/{user_id}", response_model=UserOut)
async def patch_user(
    user_id: int,
    factory: SessionFactoryDep,
    body: PatchUserBody,
    _: AdminDep,
) -> UserOut:
    async with factory() as session:
        r = await session.execute(select(User).where(User.id == user_id))
        u = r.scalar_one_or_none()
        if u is None:
            raise HTTPException(status_code=404, detail="user not found")
        if body.role is not None:
            new_role = _validate_user_role(body.role.strip())
            if u.role == ROLE_ADMIN and new_role == ROLE_OPERATOR:
                others = await _count_admins(factory, exclude_user_id=u.id)
                if others == 0:
                    raise HTTPException(
                        status_code=400,
                        detail="cannot demote the last admin",
                    )
            u.role = new_role
        await session.commit()
        await session.refresh(u)
        sids: list[str] = []
        if u.role == ROLE_OPERATOR:
            sr = await session.execute(
                select(UserSessionAccess.session_id).where(
                    UserSessionAccess.user_id == u.id
                )
            )
            sids = list(sr.scalars().all())
    return UserOut(
        id=u.id, username=u.username, role=u.role, session_ids=sids
    )


@router.put("/users/{user_id}/sessions", response_model=UserOut)
async def put_user_sessions(
    user_id: int,
    factory: SessionFactoryDep,
    body: PutUserSessionsBody,
    _: AdminDep,
) -> UserOut:
    async with factory() as session:
        r = await session.execute(select(User).where(User.id == user_id))
        u = r.scalar_one_or_none()
        if u is None:
            raise HTTPException(status_code=404, detail="user not found")
        if u.role != ROLE_OPERATOR:
            raise HTTPException(
                status_code=400,
                detail="session access applies only to operators",
            )
        for sid in body.session_ids:
            cr = await session.execute(
                select(SessionModel.id).where(SessionModel.id == sid).limit(1)
            )
            if cr.scalar_one_or_none() is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"unknown session: {sid}",
                )
        await session.execute(
            delete(UserSessionAccess).where(UserSessionAccess.user_id == user_id)
        )
        seen: set[str] = set()
        for sid in body.session_ids:
            if sid in seen:
                continue
            seen.add(sid)
            session.add(UserSessionAccess(user_id=user_id, session_id=sid))
        await session.commit()
        sr = await session.execute(
            select(UserSessionAccess.session_id).where(
                UserSessionAccess.user_id == user_id
            )
        )
        sids = list(sr.scalars().all())
    return UserOut(
        id=u.id, username=u.username, role=u.role, session_ids=sids
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    factory: SessionFactoryDep,
    admin: AdminDep,
) -> Response:
    if user_id == admin.id:
        raise HTTPException(
            status_code=400,
            detail="cannot delete yourself",
        )
    async with factory() as session:
        r = await session.execute(select(User).where(User.id == user_id))
        u = r.scalar_one_or_none()
        if u is None:
            raise HTTPException(status_code=404, detail="user not found")
        if u.role == ROLE_ADMIN:
            n = await _count_admins(factory)
            if n <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="cannot delete the last admin",
                )
        await session.execute(delete(User).where(User.id == user_id))
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/sessions")
async def list_sessions(
    factory: SessionFactoryDep,
    user: CurrentUserDep,
) -> list[SessionRow]:
    async with factory() as session:
        if user.role == ROLE_ADMIN:
            r = await session.execute(
                select(SessionModel).order_by(SessionModel.created_at.desc())
            )
        else:
            r = await session.execute(
                select(SessionModel)
                .join(
                    UserSessionAccess,
                    SessionModel.id == UserSessionAccess.session_id,
                )
                .where(UserSessionAccess.user_id == user.id)
                .order_by(SessionModel.created_at.desc())
            )
        rows = r.scalars().all()
    return [
        SessionRow(id=m.id, name=m.name, created_at=m.created_at) for m in rows
    ]


@router.post("/sessions")
async def create_session(
    factory: SessionFactoryDep,
    runtime: RuntimeDep,
    body: CreateSessionBody,
    uid: AdminDep,
) -> SessionRow:
    sid = uuid4()
    now = int(time.time())
    name = body.name.strip()
    gs = default_game_state(body.field_count)
    payload = gs.model_dump_json(by_alias=True)
    async with factory() as session:
        session.add(
            SessionModel(
                id=str(sid),
                name=name,
                game_state_json=payload,
                owner_user_id=uid.id,
                created_at=now,
            )
        )
        await session.commit()
    runtime.register(sid, gs)
    return SessionRow(id=str(sid), name=name, created_at=now)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session_route(
    session_id: UUID,
    factory: SessionFactoryDep,
    runtime: RuntimeDep,
    _: AdminDep,
):
    async with factory() as session:
        r = await session.execute(
            delete(SessionModel).where(SessionModel.id == str(session_id))
        )
        n = r.rowcount
        await session.commit()
    if not n:
        raise HTTPException(status_code=404, detail="session not found")
    runtime.remove(session_id)


async def _persist_state(
    factory: async_sessionmaker[AsyncSession], sid: UUID, gs: GameState
) -> None:
    async with factory() as session:
        await session.execute(
            update(SessionModel)
            .where(SessionModel.id == str(sid))
            .values(game_state_json=gs.model_dump_json(by_alias=True))
        )
        await session.commit()


@router.get("/sessions/{session_id}/vmix")
async def get_vmix(
    session_id: UUID,
    runtime: RuntimeDep,
) -> list[dict[str, Any]]:
    """Чтение для Hockey Desktop Host / vMix: без cookie; JSON-массив."""
    if not runtime.has(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    snap = await runtime.get_snapshot(session_id)
    assert snap is not None
    return build_vmix_array(snap)


@router.get("/sessions/{session_id}/state")
async def get_state(
    session_id: UUID,
    runtime: RuntimeDep,
) -> dict[str, Any]:
    """Публичное чтение состояния по UUID (как /vmix). Правки — только с авторизацией."""
    if not runtime.has(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    snap = await runtime.get_snapshot(session_id)
    assert snap is not None
    return snap.model_dump(by_alias=True, mode="json")


@router.patch("/sessions/{session_id}/state")
async def patch_state(
    session_id: UUID,
    runtime: RuntimeDep,
    factory: SessionFactoryDep,
    body: dict[str, Any],
    user: CurrentUserDep,
) -> dict[str, Any]:
    await _ensure_session_access(factory, user, session_id)
    if not runtime.has(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    try:
        merged = await runtime.patch(session_id, body, merge_patch_and_sync)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    await _persist_state(factory, session_id, merged)
    return merged.model_dump(by_alias=True, mode="json")


@router.post("/sessions/{session_id}/reset")
async def reset_state(
    session_id: UUID,
    runtime: RuntimeDep,
    factory: SessionFactoryDep,
    user: CurrentUserDep,
) -> dict[str, Any]:
    await _ensure_session_access(factory, user, session_id)
    if not runtime.has(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    fresh = await runtime.reset_default(session_id)
    await _persist_state(factory, session_id, fresh)
    return fresh.model_dump(by_alias=True, mode="json")
