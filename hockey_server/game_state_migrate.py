"""Миграция сохранённого JSON: старый TeamA/ScoreA → новый формат HA/GA/HB/GB."""

from __future__ import annotations

import json
from typing import Any

from hockey_server.schemas import GameState


def migrate_raw_game_dict(d: dict[str, Any]) -> dict[str, Any]:
    if "TeamHA" in d:
        out = dict(d)
        if "FieldCount" not in out:
            out["FieldCount"] = 2
        return out

    return {
        "FieldCount": 1,
        "TournamentTitle": d.get(
            "TournamentTitle", "Регулярный турнир по хоккею с шайбой"
        ),
        "SeriesInfo": d.get("SeriesInfo", ""),
        "BrandingImage": d.get("BrandingImage", ""),
        "TeamHA": d.get("TeamA", "A"),
        "TeamHAFull": d.get("TeamAFull", "Team A"),
        "TeamGA": d.get("TeamB", "B"),
        "TeamGAFull": d.get("TeamBFull", "Team B"),
        "TeamHB": "None",
        "TeamHBFull": "",
        "TeamGB": "None",
        "TeamGBFull": "",
        "PenaltyH": d.get("penalty_a", "None"),
        "PenaltyG": d.get("penalty_b", "None"),
        "ScoreHA": int(d.get("ScoreA", 0) or 0),
        "ScoreGA": int(d.get("ScoreB", 0) or 0),
        "ScoreHB": 0,
        "ScoreGB": 0,
        "ShotsH": int(d.get("ShotsA", 0) or 0),
        "ShotsG": int(d.get("ShotsB", 0) or 0),
        "LogoHA": d.get("logo_a", "team-a.png"),
        "LogoGA": d.get("logo_b", "team-b.png"),
        "LogoHB": "",
        "LogoGB": "",
        "logoLeagues": d.get("BrandingImage", ""),
        "Timer": d.get("Timer", "20:00"),
        "TimerBaseline": d.get("TimerBaseline", "20:00"),
        "PowerPlayTimer": d.get("PowerPlayTimer", "02:00"),
        "PowerPlayActive": bool(d.get("PowerPlayActive", False)),
        "Period": int(d.get("Period", 1) or 1),
        "Running": bool(d.get("Running", False)),
        "Visible": bool(d.get("Visible", True)),
    }


def parse_game_state_json(raw: str) -> GameState:
    d = json.loads(raw)
    if not isinstance(d, dict):
        d = {}
    d2 = migrate_raw_game_dict(d)
    return apply_field_count_rules(GameState.model_validate(d2))


def apply_field_count_rules(gs: GameState) -> GameState:
    if gs.field_count != 1:
        return gs
    return gs.model_copy(
        update={
            "team_h_b": "None",
            "team_g_b": "None",
            "team_h_b_full": "",
            "team_g_b_full": "",
            "score_h_b": 0,
            "score_g_b": 0,
            "logo_h_b": "",
            "logo_g_b": "",
        }
    )
