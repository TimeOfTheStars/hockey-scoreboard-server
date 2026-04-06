import asyncio
from uuid import UUID

from hockey_server.schemas import GameState


class SessionRuntime:
    """In-memory game state per session with per-session asyncio locks."""

    def __init__(self) -> None:
        self._states: dict[UUID, GameState] = {}
        self._locks: dict[UUID, asyncio.Lock] = {}

    def register(self, sid: UUID, state: GameState) -> None:
        if sid not in self._locks:
            self._locks[sid] = asyncio.Lock()
        self._states[sid] = state

    def remove(self, sid: UUID) -> None:
        self._states.pop(sid, None)
        self._locks.pop(sid, None)

    def has(self, sid: UUID) -> bool:
        return sid in self._states

    def all_ids(self) -> list[UUID]:
        return list(self._states.keys())

    async def get_snapshot(self, sid: UUID) -> GameState | None:
        lock = self._locks.get(sid)
        if lock is None:
            return None
        async with lock:
            return self._states[sid].model_copy(deep=True)

    async def patch(
        self, sid: UUID, body: dict, merge_fn
    ) -> GameState:
        lock = self._locks[sid]
        async with lock:
            prev = self._states[sid]
            merged = merge_fn(prev, body)
            self._states[sid] = merged
            return merged.model_copy(deep=True)

    async def reset_default(self, sid: UUID) -> GameState:
        lock = self._locks[sid]
        async with lock:
            fresh = GameState()
            self._states[sid] = fresh
            return fresh.model_copy(deep=True)

    async def try_tick(self, sid: UUID, tick_fn) -> GameState | None:
        """If session is running, apply tick and return new state; else None."""
        lock = self._locks.get(sid)
        if lock is None:
            return None
        async with lock:
            st = self._states[sid]
            if not st.running:
                return None
            new_st = tick_fn(st)
            self._states[sid] = new_st
            return new_st.model_copy(deep=True)
