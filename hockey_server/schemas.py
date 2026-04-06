from pydantic import BaseModel, ConfigDict, Field


class GameState(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    tournament_title: str = Field(
        default="Регулярный турнир по хоккею с шайбой", alias="TournamentTitle"
    )
    series_info: str = Field(default="", alias="SeriesInfo")
    branding_image: str = Field(default="", alias="BrandingImage")
    team_a: str = Field(default="A", alias="TeamA")
    team_a_full: str = Field(default="Team A", alias="TeamAFull")
    team_b: str = Field(default="B", alias="TeamB")
    team_b_full: str = Field(default="Team B", alias="TeamBFull")
    penalty_a: str = Field(default="None", alias="penalty_a")
    penalty_b: str = Field(default="None", alias="penalty_b")
    score_a: int = Field(default=0, alias="ScoreA")
    score_b: int = Field(default=0, alias="ScoreB")
    shots_a: int = Field(default=0, alias="ShotsA")
    shots_b: int = Field(default=0, alias="ShotsB")
    logo_a: str = Field(default="team-a.png", alias="logo_a")
    logo_b: str = Field(default="team-b.png", alias="logo_b")
    timer: str = Field(default="20:00", alias="Timer")
    timer_baseline: str = Field(default="20:00", alias="TimerBaseline")
    power_play_timer: str = Field(default="02:00", alias="PowerPlayTimer")
    power_play_active: bool = Field(default=False, alias="PowerPlayActive")
    period: int = Field(default=1, alias="Period")
    running: bool = Field(default=False, alias="Running")
    visible: bool = Field(default=True, alias="Visible")


class LoginBody(BaseModel):
    username: str
    password: str


class CreateSessionBody(BaseModel):
    name: str = ""


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
