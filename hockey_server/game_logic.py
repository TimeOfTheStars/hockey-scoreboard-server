from typing import Any

from hockey_server.schemas import GameState


def parse_mmss(s: str) -> int | None:
    s = s.strip()
    parts = s.split(":")
    if len(parts) != 2:
        return None
    try:
        mm = int(parts[0])
        ss = int(parts[1])
    except ValueError:
        return None
    if ss >= 60:
        return None
    return mm * 60 + ss


def format_mmss(total_secs: int) -> str:
    mm = total_secs // 60
    ss = total_secs % 60
    return f"{mm:02d}:{ss:02d}"


def _tick_main_timer(d: dict[str, Any]) -> None:
    t = parse_mmss(str(d.get("Timer", "")))
    if t is None:
        return
    if t == 0:
        d["Running"] = False
        return
    nt = t - 1
    d["Timer"] = format_mmss(nt)
    if nt == 0:
        d["Running"] = False


def _tick_power_play(d: dict[str, Any]) -> None:
    t = parse_mmss(str(d.get("PowerPlayTimer", "")))
    if t is None:
        return
    if t == 0:
        d["PowerPlayActive"] = False
        return
    nt = t - 1
    d["PowerPlayTimer"] = format_mmss(nt)
    if nt == 0:
        d["PowerPlayActive"] = False


def tick_timers(gs: GameState) -> GameState:
    if not gs.running:
        return gs
    d = gs.model_dump(by_alias=True, mode="json")
    _tick_main_timer(d)
    if d.get("Running") and d.get("PowerPlayActive"):
        _tick_power_play(d)
    return GameState.model_validate(d)


def merge_patch(base: GameState, patch: dict[str, Any]) -> GameState:
    if not isinstance(patch, dict):
        raise ValueError("тело PATCH должно быть JSON-объектом")
    d = base.model_dump(by_alias=True, mode="json")
    for k, v in patch.items():
        d[k] = v
    return GameState.model_validate(d)


def sync_timer_baseline(prev: GameState, merged: GameState) -> GameState:
    if merged.running:
        if not prev.running:
            return merged.model_copy(update={"timer_baseline": merged.timer})
        return merged
    if prev.running and not merged.running:
        return merged
    if prev.timer != merged.timer:
        return merged.model_copy(update={"timer_baseline": merged.timer})
    return merged


def merge_patch_and_sync(prev: GameState, patch: dict[str, Any]) -> GameState:
    merged = merge_patch(prev, patch)
    return sync_timer_baseline(prev, merged)
