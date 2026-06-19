from pydantic import BaseModel
from typing import Optional, Literal


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class WSInitializeMessage(BaseModel):
    type: Literal["initialize"]
    session_id: str
    user_id: str
    profession_id: str
    experience_level: Optional[str] = "in_training"
    user_background: Optional[str] = ""
    career_goals: Optional[str] = ""
    user_first_name: Optional[str] = ""


class WSChatMessage(BaseModel):
    type: Literal["chat"]
    message_id: Optional[str] = None
    messages: list[ChatMessage]


class WSEndMessage(BaseModel):
    type: Literal["end"]


class WSPingMessage(BaseModel):
    type: Literal["ping"]


class HistoryResponse(BaseModel):
    session_id: str
    messages: list[ChatMessage]
    profession_id: str
