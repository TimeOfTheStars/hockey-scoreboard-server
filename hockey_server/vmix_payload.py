"""Ответ GET …/vmix: JSON-массив из одного объекта (как на арене)."""

from __future__ import annotations

from hockey_server.schemas import GameState


def build_vmix_row(gs: GameState) -> dict:
    if gs.field_count == 1:
        return {
            "TournamentTitle": gs.tournament_title,
            "TeamHA": gs.team_h_a,
            "TeamHAFull": gs.team_h_a_full,
            "TeamGA": gs.team_g_a,
            "TeamGAFull": gs.team_g_a_full,
            "TeamHB": "None",
            "TeamHBFull": "",
            "TeamGB": "None",
            "TeamGBFull": "",
            "PenaltyH": gs.penalty_h,
            "PenaltyG": gs.penalty_g,
            "ScoreHA": gs.score_h_a,
            "ScoreGA": gs.score_g_a,
            "ScoreHB": 0,
            "ScoreGB": 0,
            "ShotsH": gs.shots_h,
            "ShotsG": gs.shots_g,
            "LogoHA": gs.logo_h_a,
            "LogoGA": gs.logo_g_a,
            "LogoHB": "",
            "LogoGB": "",
            "logoLeagues": gs.logo_leagues,
            "Timer": gs.timer,
            "Period": gs.period,
            "Running": gs.running,
            "Visible": gs.visible,
        }
    return {
        "TournamentTitle": gs.tournament_title,
        "TeamHA": gs.team_h_a,
        "TeamHAFull": gs.team_h_a_full,
        "TeamGA": gs.team_g_a,
        "TeamGAFull": gs.team_g_a_full,
        "TeamHB": gs.team_h_b,
        "TeamHBFull": gs.team_h_b_full,
        "TeamGB": gs.team_g_b,
        "TeamGBFull": gs.team_g_b_full,
        "PenaltyH": gs.penalty_h,
        "PenaltyG": gs.penalty_g,
        "ScoreHA": gs.score_h_a,
        "ScoreGA": gs.score_g_a,
        "ScoreHB": gs.score_h_b,
        "ScoreGB": gs.score_g_b,
        "ShotsH": gs.shots_h,
        "ShotsG": gs.shots_g,
        "LogoHA": gs.logo_h_a,
        "LogoGA": gs.logo_g_a,
        "LogoHB": gs.logo_h_b,
        "LogoGB": gs.logo_g_b,
        "logoLeagues": gs.logo_leagues,
        "Timer": gs.timer,
        "Period": gs.period,
        "Running": gs.running,
        "Visible": gs.visible,
    }


def build_vmix_array(gs: GameState) -> list[dict]:
    return [build_vmix_row(gs)]
