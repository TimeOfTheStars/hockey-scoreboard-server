"""Публичные абсолютные URL для полей логотипов (GET /vmix, GET /state)."""

from __future__ import annotations

from hockey_server.schemas import GameState

_LOGO_KEYS = ("LogoHA", "LogoGA", "LogoHB", "LogoGB", "logoLeagues")


def _encode_path_segment_iri(segment: str) -> str:
    """IRI-путь: кириллица и прочий Unicode остаются в строке; кодируем пробел и небезопасный ASCII."""
    parts: list[str] = []
    for ch in segment:
        o = ord(ch)
        if ch == " ":
            parts.append("%20")
        elif o < 128:
            if ch.isalnum() or ch in "-._~":
                parts.append(ch)
            else:
                parts.append(f"%{o:02X}")
        else:
            parts.append(ch)
    return "".join(parts)


def expand_public_asset_url(value: str, public_base: str | None) -> str:
    if not value or not (public_base or "").strip():
        return value
    base = public_base.strip().rstrip("/")
    v = value.strip()
    if v.startswith("http://") or v.startswith("https://"):
        return value
    path = v.lstrip("/")
    if not path:
        return value
    encoded = "/".join(
        _encode_path_segment_iri(segment) for segment in path.split("/")
    )
    return f"{base}/{encoded}"


def expand_logo_fields_for_response(gs: GameState, public_base: str | None) -> dict:
    d = gs.model_dump(by_alias=True, mode="json")
    if not (public_base or "").strip():
        return d
    for key in _LOGO_KEYS:
        val = d.get(key)
        if isinstance(val, str):
            d[key] = expand_public_asset_url(val, public_base)
    return d
