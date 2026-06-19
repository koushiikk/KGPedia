import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
FIREBASE_CREDENTIALS_JSON: str = os.getenv("FIREBASE_CREDENTIALS_JSON", "")
FIREBASE_DATABASE_URL: str = os.getenv("FIREBASE_DATABASE_URL", "")

# Primary model — used for chat generation, welcome messages, summaries (high-quality tasks)
LLM_MAIN_MODEL: str = os.getenv("LLM_MAIN_MODEL", "gpt-4o")
# Router model — used for lightweight tool-call detection only
LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o-mini")
# Gemini — kept for fallback / small utility tasks only
GEMINI_GENERATOR_MODEL: str = os.getenv("GEMINI_GENERATOR_MODEL", "gemini-2.5-flash")

CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

APP_ENV: str = os.getenv("APP_ENV", "development")
