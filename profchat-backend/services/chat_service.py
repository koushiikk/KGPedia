"""
ChatSession — in-memory session state for an active WebSocket conversation.
One ChatSession lives as long as the WebSocket connection is open.
"""
import logging
from typing import Optional

logger = logging.getLogger("chat_service")


class ChatSession:
    def __init__(self, session_id: str, user_id: str):
        self.session_id = session_id
        self.user_id = user_id
        self.profession_id: str = ""
        self.experience_level: str = ""
        self.user_background: str = ""
        self.career_goals: str = ""
        self.user_first_name: str = ""
        self.profession_area: str = ""
        self.last_session_summary: str = ""
        self._messages: list[dict] = []
        self._cached_system_prompt: Optional[dict] = None

    def add_message(self, role: str, content: str):
        self._messages.append({"role": role, "content": content})

    def get_messages(self) -> list[dict]:
        return list(self._messages)

    def get_session_context(self) -> dict:
        return {
            "user_id": self.user_id,
            "session_id": self.session_id,
            "profession_id": self.profession_id,
            "experience_level": self.experience_level,
            "user_background": self.user_background,
            "career_goals": self.career_goals,
            "user_first_name": self.user_first_name,
            "profession_area": self.profession_area,
            "last_session_summary": self.last_session_summary,
        }

    def build_convo_messages(self, user_content: str) -> list[dict]:
        """Return [system, ...history, user_turn] ready for the LLM."""
        from utils.prompts.profession_prompt_builder import build_profession_system_prompt
        if not self._cached_system_prompt:
            self._cached_system_prompt = build_profession_system_prompt(self.get_session_context())
        messages = [self._cached_system_prompt] + self.get_messages() + [{"role": "user", "content": user_content}]
        return messages

    def clear_system_prompt_cache(self):
        self._cached_system_prompt = None


# Global in-memory registry of active sessions keyed by session_id
_active_sessions: dict[str, ChatSession] = {}


def get_active_session(session_id: str) -> Optional[ChatSession]:
    return _active_sessions.get(session_id)


def register_session(session: ChatSession):
    _active_sessions[session.session_id] = session
    logger.info(f"Session registered: {session.session_id} (total active: {len(_active_sessions)})")


def deregister_session(session_id: str):
    _active_sessions.pop(session_id, None)
    logger.info(f"Session deregistered: {session_id} (total active: {len(_active_sessions)})")
