from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class GameState(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    field_count: Literal[1, 2] = Field(default=2, alias="FieldCount")

    tournament_title: str = Field(
        default="Регулярный турнир по хоккею с шайбой", alias="TournamentTitle"
    )
    series_info: str = Field(default="", alias="SeriesInfo")
    branding_image: str = Field(default="", alias="BrandingImage")

    team_h_a: str = Field(default="A", alias="TeamHA")
    team_h_a_full: str = Field(default="Team A", alias="TeamHAFull")
    team_g_a: str = Field(default="B", alias="TeamGA")
    team_g_a_full: str = Field(default="Team B", alias="TeamGAFull")

    team_h_b: str = Field(default="C", alias="TeamHB")
    team_h_b_full: str = Field(default="Team C", alias="TeamHBFull")
    team_g_b: str = Field(default="D", alias="TeamGB")
    team_g_b_full: str = Field(default="Team D", alias="TeamGBFull")

    penalty_h: str = Field(default="None", alias="PenaltyH")
    penalty_g: str = Field(default="None", alias="PenaltyG")

    score_h_a: int = Field(default=0, alias="ScoreHA")
    score_g_a: int = Field(default=0, alias="ScoreGA")
    score_h_b: int = Field(default=0, alias="ScoreHB")
    score_g_b: int = Field(default=0, alias="ScoreGB")

    shots_h: int = Field(default=0, alias="ShotsH")
    shots_g: int = Field(default=0, alias="ShotsG")

    logo_h_a: str = Field(default="", alias="LogoHA")
    logo_g_a: str = Field(default="", alias="LogoGA")
    logo_h_b: str = Field(default="", alias="LogoHB")
    logo_g_b: str = Field(default="", alias="LogoGB")
    logo_leagues: str = Field(default="", alias="logoLeagues")

    timer: str = Field(default="20:00", alias="Timer")
    timer_baseline: str = Field(default="20:00", alias="TimerBaseline")
    power_play_timer: str = Field(default="02:00", alias="PowerPlayTimer")
    power_play_active: bool = Field(default=False, alias="PowerPlayActive")
    period: int = Field(default=1, alias="Period")
    running: bool = Field(default=False, alias="Running")
    visible: bool = Field(default=True, alias="Visible")

    @field_validator("field_count", mode="before")
    @classmethod
    def _coerce_field_count(cls, v: object) -> int:
        try:
            n = int(v)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 2
        if n < 1:
            return 1
        if n > 2:
            return 2
        return n


def default_game_state(field_count: Literal[1, 2] = 2) -> GameState:
    gs = GameState(field_count=field_count)
    if field_count == 1:
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
    return gs


class LoginBody(BaseModel):
    username: str
    password: str


class CreateSessionBody(BaseModel):
    name: str = ""
    field_count: Literal[1, 2] = 2


class SessionRow(BaseModel):
    id: str
    name: str
    created_at: int


class MeOut(BaseModel):
    id: int
    username: str
    role: str


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    session_ids: list[str] = []


class CreateUserBody(BaseModel):
    username: str
    password: str
    role: str = "operator"


class PatchUserBody(BaseModel):
    role: str | None = None


class PutUserSessionsBody(BaseModel):
    session_ids: list[str]
