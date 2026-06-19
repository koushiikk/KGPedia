"""
Session lifecycle management: create, retrieve, and end sessions in Firestore.
"""
import logging
import uuid
from utils.firebase_utils import (
    create_session,
    get_session,
    save_session_summary,
    get_last_session_summary,
)

logger = logging.getLogger("session_service")


def new_session(user_id: str, profession_id: str, session_type: str = "scenario_chat") -> dict:
    """Create a new session in Firestore and return the session data."""
    session_id = str(uuid.uuid4())
    data = create_session(session_id=session_id, user_id=user_id, profession_id=profession_id, session_type=session_type)
    logger.info(f"Created session {session_id} for user {user_id}, profession {profession_id}")
    return data


def fetch_session(session_id: str) -> dict | None:
    """Retrieve session data from Firestore."""
    return get_session(session_id)


def end_session(session_id: str, user_id: str, summary: dict):
    """Mark session as ended and save summary."""
    save_session_summary(session_id=session_id, user_id=user_id, summary=summary)
    logger.info(f"Session ended: {session_id}")


def fetch_last_summary(user_id: str, profession_id: str) -> str:
    """Retrieve the last session summary for this user+profession (for returning user context)."""
    return get_last_session_summary(user_id=user_id, profession_id=profession_id)
