from fastapi import APIRouter, HTTPException, status
from models.session import SessionCreate, SessionResponse, SessionEndResponse
from models.chat import HistoryResponse, ChatMessage
from services.session_service import new_session, fetch_session, end_session, fetch_last_summary
from services.summary_service import generate_session_summary
from services.chat_service import get_active_session
import logging

logger = logging.getLogger("session_router")
router = APIRouter(prefix="/api", tags=["sessions"])


@router.post("/session", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(payload: SessionCreate):
    """Create a new scenario chat session and return the session_id."""
    try:
        data = new_session(
            user_id=payload.user_id,
            profession_id=payload.profession_id,
            session_type="scenario_chat",
        )
        return SessionResponse(
            session_id=data["session_id"],
            user_id=payload.user_id,
            profession_id=payload.profession_id,
        )
    except Exception as e:
        logger.error(f"Error creating session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create session")


@router.delete("/session/{session_id}", response_model=SessionEndResponse)
async def end_session_endpoint(session_id: str, user_id: str):
    """End a session, generate its summary, and persist to Firestore."""
    active = get_active_session(session_id)
    summary = {}
    if active:
        summary = await generate_session_summary(active)
        end_session(session_id=session_id, user_id=user_id, summary=summary)
    else:
        session_data = fetch_session(session_id)
        if not session_data:
            raise HTTPException(status_code=404, detail="Session not found")
        end_session(session_id=session_id, user_id=user_id, summary={})

    return SessionEndResponse(session_id=session_id, status="ended", summary=summary)


@router.get("/history/{session_id}", response_model=HistoryResponse)
async def get_session_history(session_id: str):
    """Return chat history for a given session."""
    # First check in-memory active sessions
    active = get_active_session(session_id)
    if active:
        messages = [ChatMessage(role=m["role"], content=m["content"]) for m in active.get_messages()]
        return HistoryResponse(session_id=session_id, messages=messages, profession_id=active.profession_id)

    # Fall back to Firestore
    session_data = fetch_session(session_id)
    if not session_data:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = [
        ChatMessage(role=m["role"], content=m["content"])
        for m in (session_data.get("messages") or [])
    ]
    return HistoryResponse(
        session_id=session_id,
        messages=messages,
        profession_id=session_data.get("profession_id", ""),
    )
