import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional
import firebase_admin
from firebase_admin import credentials, firestore
from config.settings import FIREBASE_CREDENTIALS_JSON, FIREBASE_DATABASE_URL

logger = logging.getLogger("firebase_utils")

_db = None
_firebase_available = False

# In-memory fallback store used when Firebase credentials are missing or invalid.
# Structure: {session_id: session_dict}
_memory_sessions: dict = {}
# {user_id: [{session_id, role_title, summary, ...}]}
_memory_summaries: dict = {}


def _init_firebase():
    global _db, _firebase_available
    if _firebase_available:
        return

    if firebase_admin._apps:
        try:
            _db = firestore.client()
            _firebase_available = True
            logger.info("Firebase client reused from existing app")
        except Exception as e:
            logger.warning(f"Could not get Firestore client from existing app: {e}")
        return

    if not FIREBASE_CREDENTIALS_JSON or FIREBASE_CREDENTIALS_JSON.strip() in ("", "{}"):
        logger.warning("FIREBASE_CREDENTIALS_JSON not set — using in-memory storage")
        return

    try:
        cred_dict = json.loads(FIREBASE_CREDENTIALS_JSON)
        required_fields = {"type", "project_id", "private_key", "client_email", "token_uri"}
        missing = required_fields - cred_dict.keys()
        if missing:
            logger.warning(
                f"Firebase credentials JSON is missing fields {missing} — using in-memory storage"
            )
            return

        cred = credentials.Certificate(cred_dict)
        init_kwargs: dict = {}
        if FIREBASE_DATABASE_URL and "your-project" not in FIREBASE_DATABASE_URL:
            init_kwargs["databaseURL"] = FIREBASE_DATABASE_URL
        firebase_admin.initialize_app(cred, init_kwargs)
        _db = firestore.client()
        _firebase_available = True
        logger.info("Firebase initialized successfully")
    except json.JSONDecodeError as e:
        logger.warning(f"FIREBASE_CREDENTIALS_JSON is not valid JSON: {e} — using in-memory storage")
    except Exception as e:
        logger.warning(f"Firebase initialization failed: {e} — using in-memory storage")


def _ensure_init():
    global _firebase_available
    if not _firebase_available and _db is None:
        _init_firebase()


def get_db() -> Optional[firestore.Client]:
    _ensure_init()
    return _db


# ---------------------------------------------------------------------------
# Session CRUD — delegates to Firestore or in-memory fallback transparently.
# ---------------------------------------------------------------------------

def create_session(session_id: str, user_id: str, profession_id: str, session_type: str = "scenario_chat") -> dict:
    """Create a new session document in Firestore (or memory)."""
    _ensure_init()
    session_data = {
        "session_id": session_id,
        "user_id": user_id,
        "profession_id": profession_id,
        "session_type": session_type,
        "started_at": datetime.now(timezone.utc),
        "ended_at": None,
        "messages": [],
        "summary": None,
        "portfolio_saved": False,
    }

    if _firebase_available and _db:
        try:
            _db.collection("sessions").document(session_id).set(session_data)
            logger.info(f"Session created in Firestore: {session_id}")
            return session_data
        except Exception as e:
            logger.warning(f"Firestore write failed, falling back to memory: {e}")

    _memory_sessions[session_id] = dict(session_data)
    logger.info(f"Session created in memory: {session_id}")
    return session_data


def get_session(session_id: str) -> Optional[dict]:
    """Retrieve a session document from Firestore (or memory)."""
    _ensure_init()

    if _firebase_available and _db:
        try:
            doc = _db.collection("sessions").document(session_id).get()
            if doc.exists:
                return doc.to_dict()
        except Exception as e:
            logger.warning(f"Firestore read failed, checking memory: {e}")

    return _memory_sessions.get(session_id)


def append_message_to_session(session_id: str, role: str, content: str):
    """Append a chat message to the session's message array."""
    _ensure_init()
    message = {"role": role, "content": content, "ts": datetime.now(timezone.utc).isoformat()}

    if _firebase_available and _db:
        try:
            _db.collection("sessions").document(session_id).update(
                {"messages": firestore.ArrayUnion([message])}
            )
            return
        except Exception as e:
            logger.warning(f"Firestore append failed, updating memory: {e}")

    if session_id in _memory_sessions:
        _memory_sessions[session_id].setdefault("messages", []).append(message)


def save_session_summary(session_id: str, user_id: str, summary: dict):
    """Save session summary and mark session as ended."""
    _ensure_init()
    now = datetime.now(timezone.utc)

    if _firebase_available and _db:
        try:
            _db.collection("sessions").document(session_id).update(
                {"summary": summary, "ended_at": now}
            )
            _db.collection("users").document(user_id).collection("session_summaries").document(session_id).set(
                {**summary, "session_id": session_id, "saved_at": now}
            )
            logger.info(f"Summary saved to Firestore for session {session_id}")
            return
        except Exception as e:
            logger.warning(f"Firestore summary save failed, using memory: {e}")

    if session_id in _memory_sessions:
        _memory_sessions[session_id]["summary"] = summary
        _memory_sessions[session_id]["ended_at"] = now
    _memory_summaries.setdefault(user_id, []).append(
        {**summary, "session_id": session_id, "profession_id": _memory_sessions.get(session_id, {}).get("profession_id", ""), "saved_at": now}
    )
    logger.info(f"Summary saved to memory for session {session_id}")


def get_last_session_summary(user_id: str, profession_id: str) -> str:
    """Get the summary from the user's last session for the same profession."""
    _ensure_init()

    if _firebase_available and _db:
        try:
            sessions = (
                _db.collection("users")
                .document(user_id)
                .collection("session_summaries")
                .order_by("saved_at", direction=firestore.Query.DESCENDING)
                .limit(5)
                .stream()
            )
            for doc in sessions:
                data = doc.to_dict()
                if data.get("profession_id") == profession_id and data.get("debrief"):
                    return data.get("debrief", "")
            return ""
        except Exception as e:
            logger.warning(f"Firestore query failed, checking memory: {e}")

    user_summaries = sorted(
        _memory_summaries.get(user_id, []),
        key=lambda x: x.get("saved_at", datetime.min.replace(tzinfo=timezone.utc)),
        reverse=True,
    )
    for s in user_summaries[:5]:
        if s.get("profession_id") == profession_id and s.get("debrief"):
            return s.get("debrief", "")
    return ""


def save_portfolio_item(
    user_id: str,
    session_id: str,
    module_name: str,
    summary_content: str,
    skills_identified: list,
    student_reflections: Optional[dict] = None,
) -> dict:
    """Save a career insights portfolio item to Firestore (or memory)."""
    _ensure_init()
    portfolio_data = {
        "session_id": session_id,
        "session_type": "scenario_chat",
        "module_name": module_name,
        "summary_content": summary_content,
        "skills_identified": skills_identified,
        "student_reflections": student_reflections or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc),
    }

    if _firebase_available and _db:
        try:
            _db.collection("users").document(user_id).collection("portfolio").document(session_id).set(portfolio_data)
            _db.collection("sessions").document(session_id).update({"portfolio_saved": True})
            logger.info(f"Portfolio item saved to Firestore for user {user_id}, session {session_id}")
            return {"status": "success", "message": "Portfolio item saved successfully", "portfolio_id": session_id}
        except Exception as e:
            logger.warning(f"Firestore portfolio save failed: {e}")

    if session_id in _memory_sessions:
        _memory_sessions[session_id]["portfolio_saved"] = True
    logger.info(f"Portfolio item saved to memory for user {user_id}, session {session_id}")
    return {"status": "success", "message": "Portfolio item saved (in-memory)", "portfolio_id": session_id}
