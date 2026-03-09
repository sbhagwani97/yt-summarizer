from pathlib import Path
from pydantic_settings import BaseSettings

_env_file = Path(__file__).parent / ".env"


class Settings(BaseSettings):
    SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_DAYS: int = 30
    TOGETHER_API_KEY: str
    FREE_TIER_MONTHLY_LIMIT: int = 100
    DATABASE_URL: str = "sqlite:///./youtube_summarizer.db"

    class Config:
        env_file = str(_env_file)


settings = Settings()
