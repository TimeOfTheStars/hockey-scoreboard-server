from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_path: str = "./data/hockey.db"
    jwt_secret: str = ""
    admin_username: str | None = None
    admin_password: str | None = None
    cookie_secure: bool = False
    static_dir: Path | None = None
    # База для абсолютных URL логотипов в GET /vmix и GET /state (без завершающего /)
    public_base_url: str | None = None

    @field_validator("admin_username", "admin_password", mode="before")
    @classmethod
    def empty_str_none(cls, v: object) -> str | None:
        if v is None or v == "":
            return None
        return str(v)

    def resolved_static_dir(self) -> Path:
        if self.static_dir is not None:
            return Path(self.static_dir).resolve()
        return (Path(__file__).resolve().parent.parent / "dist").resolve()
