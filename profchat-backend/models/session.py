from pydantic import BaseModel
from typing import Optional
from enum import Enum


class SessionType(str, Enum):
    SCENARIO_CHAT = "scenario_chat"


class SessionCreate(BaseModel):
    user_id: str
    profession_id: str
    experience_level: Optional[str] = "in_training"
    user_background: Optional[str] = ""
    career_goals: Optional[str] = ""
    user_first_name: Optional[str] = ""


class SessionResponse(BaseModel):
    session_id: str
    user_id: str
    profession_id: str
    session_type: str = SessionType.SCENARIO_CHAT


class SessionEndResponse(BaseModel):
    session_id: str
    status: str
    summary: Optional[dict] = None
